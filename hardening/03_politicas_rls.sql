-- =============================================================
-- ANDÁ · hardening 03 — POLÍTICAS RLS POR ROL
-- ⚠️ IMPORTANTE: aplicá esto SOLO después de desplegar el frontend
-- nuevo (el viejo lee pedidos/cadetes como anónimo y se rompe).
-- Roles: 'admin' y 'cadete' vienen en user_metadata del JWT.
-- =============================================================

-- Helper: borra TODAS las políticas existentes de una tabla.
-- (Así eliminamos las políticas abiertas "using: true" actuales,
--  incluso las que tienen nombres que no conocemos.)
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['pedidos','cadetes','locales','productos','config','pedido_items','mensajes','push_subscriptions','clientes'] LOOP
    FOR p IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- =============================================================
-- ACTIVAR RLS (obligatorio: sin esto las políticas no tienen efecto)
-- =============================================================
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- PEDIDOS
-- =============================================================
CREATE POLICY pedidos_select ON public.pedidos FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'cadete'
    AND (cadete_id = (auth.jwt() -> 'user_metadata' ->> 'cadete_id')::uuid
         OR (estado = 'pendiente' AND cadete_id IS NULL))
  )
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') IS NULL
    AND auth.uid() IS NOT NULL
    AND cliente_id = auth.uid()
  )
);

CREATE POLICY pedidos_insert ON public.pedidos FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') IS NULL
    AND auth.uid() IS NOT NULL
    AND cliente_id = auth.uid()
    AND estado = 'pendiente'
    AND cadete_id IS NULL
  )
);

CREATE POLICY pedidos_update ON public.pedidos FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'cadete'
    AND (cadete_id = (auth.jwt() -> 'user_metadata' ->> 'cadete_id')::uuid
         OR (estado = 'pendiente' AND cadete_id IS NULL))
  )
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'cadete'
    AND cadete_id = (auth.jwt() -> 'user_metadata' ->> 'cadete_id')::uuid
  )
);

CREATE POLICY pedidos_delete ON public.pedidos FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- =============================================================
-- PEDIDO_ITEMS (se rige por el pedido padre)
-- =============================================================
CREATE POLICY pedido_items_select ON public.pedido_items FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'cadete'
    AND EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id
        AND (p.cadete_id = (auth.jwt() -> 'user_metadata' ->> 'cadete_id')::uuid
             OR (p.estado = 'pendiente' AND p.cadete_id IS NULL))
    )
  )
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') IS NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.cliente_id = auth.uid()
    )
  )
);

CREATE POLICY pedido_items_insert ON public.pedido_items FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') IS NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id AND p.cliente_id = auth.uid()
        AND p.estado = 'pendiente' AND p.cadete_id IS NULL
    )
  )
);

CREATE POLICY pedido_items_update ON public.pedido_items FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

CREATE POLICY pedido_items_delete ON public.pedido_items FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- =============================================================
-- CADETES
-- =============================================================
CREATE POLICY cadetes_select ON public.cadetes FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'cadete'
    AND id = (auth.jwt() -> 'user_metadata' ->> 'cadete_id')::uuid
  )
);

CREATE POLICY cadetes_insert ON public.cadetes FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

CREATE POLICY cadetes_update ON public.cadetes FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

CREATE POLICY cadetes_delete ON public.cadetes FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- =============================================================
-- LOCALES Y PRODUCTOS (catálogo público: lectura libre,
-- escritura solo admin)
-- =============================================================
CREATE POLICY locales_select ON public.locales FOR SELECT USING (true);
CREATE POLICY locales_insert ON public.locales FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);
CREATE POLICY locales_update ON public.locales FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);
CREATE POLICY locales_delete ON public.locales FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

CREATE POLICY productos_select ON public.productos FOR SELECT USING (true);
CREATE POLICY productos_insert ON public.productos FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);
CREATE POLICY productos_update ON public.productos FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);
CREATE POLICY productos_delete ON public.productos FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- =============================================================
-- CONFIG (solo admin; el resto usa la vista v_config_public)
-- =============================================================
CREATE POLICY config_select ON public.config FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);
CREATE POLICY config_insert ON public.config FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);
CREATE POLICY config_update ON public.config FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);
CREATE POLICY config_delete ON public.config FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- =============================================================
-- MENSAJES (participantes del pedido + admin)
-- =============================================================
CREATE POLICY mensajes_select ON public.mensajes FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'cadete'
    AND EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id AND p.cadete_id = (auth.jwt() -> 'user_metadata' ->> 'cadete_id')::uuid
    )
  )
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') IS NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.cliente_id = auth.uid()
    )
  )
);

CREATE POLICY mensajes_insert ON public.mensajes FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'cadete'
    AND remitente = 'cadete'
    AND EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id AND p.cadete_id = (auth.jwt() -> 'user_metadata' ->> 'cadete_id')::uuid
    )
  )
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') IS NULL
    AND auth.uid() IS NOT NULL
    AND remitente = 'cliente'
    AND EXISTS (
      SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.cliente_id = auth.uid()
    )
  )
);

CREATE POLICY mensajes_update ON public.mensajes FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

CREATE POLICY mensajes_delete ON public.mensajes FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- =============================================================
-- PUSH_SUBSCRIPTIONS (cada usuario solo las suyas)
-- =============================================================
CREATE POLICY push_subscriptions_insert ON public.push_subscriptions FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND user_id = auth.uid()
);

CREATE POLICY push_subscriptions_select ON public.push_subscriptions FOR SELECT USING (
  user_id = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

CREATE POLICY push_subscriptions_update ON public.push_subscriptions FOR UPDATE USING (
  user_id = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
) WITH CHECK (
  user_id = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

CREATE POLICY push_subscriptions_delete ON public.push_subscriptions FOR DELETE USING (
  user_id = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- =============================================================
-- CLIENTES (cada cliente solo su perfil; admin lee todo)
-- =============================================================
CREATE POLICY clientes_select ON public.clientes FOR SELECT USING (
  id = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

CREATE POLICY clientes_insert ON public.clientes FOR INSERT WITH CHECK (
  id = auth.uid()
);

CREATE POLICY clientes_update ON public.clientes FOR UPDATE USING (
  id = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
) WITH CHECK (
  id = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- =============================================================
-- ANDÁ · hardening 01 — VISTAS PÚBLICAS Y COLUMNA AUXILIAR
-- Expone solo lo que el público/cliente necesita, sin secretos.
-- =============================================================

-- Listado público de cadetes: solo id y nombre de los ACTIVOS.
-- (Los clientes ven el nombre del cadete asignado; el login real
--  va por Supabase Auth, no por esta tabla.)
CREATE OR REPLACE VIEW public.cadetes_publico AS
  SELECT id, nombre, activo FROM public.cadetes WHERE activo;
GRANT SELECT ON public.cadetes_publico TO anon, authenticated;

-- Config pública: solo tarifas por defecto. Nunca admin_password.
CREATE OR REPLACE VIEW public.v_config_public AS
  SELECT id, tarifa_default, comision_default FROM public.config;
GRANT SELECT ON public.v_config_public TO anon, authenticated;

-- Las suscripciones push se atan al usuario autenticado para RLS.
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_id uuid;

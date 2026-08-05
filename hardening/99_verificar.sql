-- =============================================================
-- ANDÁ · hardening 99 — VERIFICACIÓN FINAL
-- Corré esto DESPUÉS de aplicar 00 → 03 y revisá que los datos
-- tengan sentido.
-- =============================================================

-- 1) Políticas por tabla (todas deberían ser las nuevas, rol public,
--    con condiciones, NO "using: true" a secas)
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- 2) Políticas abiertas peligrosas: esto debe devolver CERO filas
--    (policy con qual 'true' en tablas de datos sensibles)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = 'true'
  AND tablename IN ('pedidos', 'pedido_items', 'cadetes', 'config', 'mensajes', 'clientes');

-- 3) Privilegios de anon/authenticated (solo SELECT/INSERT/UPDATE/DELETE;
--    NUNCA TRUNCATE/REFERENCES/TRIGGER)
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated') AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- 4) Usuarios de Auth por rol (esperás 1 admin + N cadetes)
SELECT raw_user_meta_data->>'rol' AS rol, count(*) AS total
FROM auth.users
WHERE raw_user_meta_data->>'rol' IS NOT NULL
GROUP BY 1;

-- 5) Ver datos de los cadetes (para confirmar el backfill):
--    SELECT email, raw_user_meta_data->>'cadete_id' FROM auth.users
--    WHERE raw_user_meta_data->>'rol' = 'cadete' LIMIT 20;

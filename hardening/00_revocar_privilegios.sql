-- =============================================================
-- ANDÁ · hardening 00 — REVOCAR PRIVILEGIOS PELIGROSOS
-- 100% seguro: la app solo usa SELECT/INSERT/UPDATE/DELETE.
-- Podés correrlo YA, antes que el resto.
-- =============================================================

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

-- Verificación (debe devolver cero filas):
SELECT tablename, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated')
  AND table_schema = 'public'
  AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');

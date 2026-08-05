-- =============================================================
-- ANDÁ · hardening 02 — USUARIOS DE SUPABASE AUTH
--   1) Creás tu cuenta de ADMINISTRADOR (editá las 3 variables de abajo).
--   2) Trigger: cada cadete recibe un usuario de Auth automáticamente,
--      con email derivado c.<id>@anda.cadete y su contraseña.
--   3) Backfill: crea los usuarios de Auth de los cadetes YA EXISTENTES.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================
-- PASO 1 · CUENTA DE ADMIN
-- EDITÁ LAS 3 VARIABLES dentro del DO de abajo antes de ejecutar.
SET search_path = public, extensions;
-- =============================================================
DO $$
DECLARE
  v_email text := 'TU_EMAIL_DE_ADMIN@EJEMPLO.COM';  -- <-- tu email
  v_pass  text := 'TU_CONTRASEÑA_DE_ADMIN';        -- <-- contraseña fuerte (mín. 8 caracteres)
  v_nombre text := 'Administrador';
BEGIN
  IF v_email LIKE '%@EJEMPLO.COM' OR v_email LIKE 'TU_EMAIL%' THEN
    RAISE EXCEPTION 'Editá v_email con tu email real antes de ejecutar.';
  END IF;
  IF length(v_pass) < 8 THEN
    RAISE EXCEPTION 'La contraseña de admin debe tener al menos 8 caracteres.';
  END IF;

  INSERT INTO auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     lower(v_email), crypt(v_pass, gen_salt('bf', 10)), now(),
     '', '', '', '',
     '{"provider":"email","providers":["email"]}',
     jsonb_build_object('rol', 'admin', 'nombre', v_nombre),
     now(), now())
  ON CONFLICT (email) DO UPDATE
     SET encrypted_password = EXCLUDED.encrypted_password,
         raw_user_meta_data = jsonb_build_object('rol', 'admin', 'nombre', v_nombre),
         email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
         updated_at = now();

  RAISE NOTICE 'Usuario admin listo: %', lower(v_email);
END $$;
-- =============================================================
-- FIN PASO 1
-- =============================================================

-- =============================================================
-- PASO 2 · FUNCIÓN + TRIGGER PARA CADETES
-- Cada cadete nuevo/actualizado (con contraseña) recibe un usuario
-- de Auth. El email derivado es c.<id>@anda.cadete (nunca se muestra).
-- =============================================================
CREATE OR REPLACE FUNCTION public.cadete_sync_auth(p_id uuid, p_nombre text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email text := 'c.' || p_id::text || '@anda.cadete';
  v_uid  uuid;
BEGIN
  IF p_password IS NULL OR p_password = '' THEN
    RETURN;
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

  IF v_uid IS NULL THEN
    INSERT INTO auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES
      (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v_email, crypt(p_password, gen_salt('bf', 10)), now(),
       '', '', '', '',
       '{"provider":"email","providers":["email"]}',
       jsonb_build_object('rol', 'cadete', 'cadete_id', p_id::text, 'nombre', p_nombre),
       now(), now());
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt(p_password, gen_salt('bf', 10)),
           raw_user_meta_data = jsonb_build_object('rol', 'cadete', 'cadete_id', p_id::text, 'nombre', p_nombre),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_uid;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_cadete_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.cadete_sync_auth(NEW.id, NEW.nombre, NEW.password);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cadete_auth ON public.cadetes;
CREATE TRIGGER trg_cadete_auth
  AFTER INSERT OR UPDATE OF password, nombre ON public.cadetes
  FOR EACH ROW EXECUTE FUNCTION public.sync_cadete_auth();

-- =============================================================
-- PASO 3 · BACKFILL DE CADETES EXISTENTES
-- =============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, nombre, password FROM public.cadetes
           WHERE password IS NOT NULL AND password <> '' LOOP
    PERFORM public.cadete_sync_auth(r.id, r.nombre, r.password);
  END LOOP;
END $$;

-- Verificación: cuántos usuarios de Auth hay por rol
SELECT raw_user_meta_data->>'rol' AS rol, count(*)
FROM auth.users
WHERE raw_user_meta_data->>'rol' IS NOT NULL
GROUP BY 1;

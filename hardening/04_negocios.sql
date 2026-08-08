-- =============================================================
-- ANDÁ · hardening 04 — NEGOCIOS (locales con usuario propio)
--   1) Agrega la columna "password" a la tabla locales.
--   2) Trigger: cada local con contraseña recibe un usuario de Auth
--      automáticamente, con email derivado l.<id>@anda.local.
--   3) RLS: un local puede editar SU fila y sus propios productos
--      (rol 'local' + user_metadata.local_id). El alta y borrado de
--      locales sigue siendo solo admin.
-- Ejecutá esto después de aplicar 00-03 y de desplegar el frontend nuevo.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.locales ADD COLUMN IF NOT EXISTS password text;

-- =============================================================
-- FUNCIÓN + TRIGGER PARA LOCALES
-- Igual que el de cadetes: cada local nuevo/actualizado (con
-- contraseña) recibe un usuario de Auth con rol 'local' y su
-- local_id en user_metadata (determinista, nunca se expone).
-- =============================================================
CREATE OR REPLACE FUNCTION public.local_sync_auth(p_id uuid, p_nombre text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email text := 'l.' || p_id::text || '@anda.local';
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
       jsonb_build_object('rol', 'local', 'local_id', p_id::text, 'nombre', p_nombre),
       now(), now());
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt(p_password, gen_salt('bf', 10)),
           raw_user_meta_data = jsonb_build_object('rol', 'local', 'local_id', p_id::text, 'nombre', p_nombre),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_uid;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_local_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.local_sync_auth(NEW.id, NEW.nombre, NEW.password);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_local_auth ON public.locales;
CREATE TRIGGER trg_local_auth
  AFTER INSERT OR UPDATE OF password, nombre ON public.locales
  FOR EACH ROW EXECUTE FUNCTION public.sync_local_auth();

-- =============================================================
-- BACKFILL: crea las cuentas de los locales YA EXISTENTES que ya
-- tienen contraseña cargada.
-- =============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, nombre, password FROM public.locales
           WHERE password IS NOT NULL AND password <> '' LOOP
    PERFORM public.local_sync_auth(r.id, r.nombre, r.password);
  END LOOP;
END $$;

-- =============================================================
-- RLS: LOCALES (el dueño edita su fila; alta/baja solo admin)
-- =============================================================
DROP POLICY IF EXISTS locales_select ON public.locales;
DROP POLICY IF EXISTS locales_insert ON public.locales;
DROP POLICY IF EXISTS locales_update ON public.locales;
DROP POLICY IF EXISTS locales_delete ON public.locales;

CREATE POLICY locales_select ON public.locales FOR SELECT USING (true);
CREATE POLICY locales_insert ON public.locales FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);
CREATE POLICY locales_update ON public.locales FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'local'
    AND id = (auth.jwt() -> 'user_metadata' ->> 'local_id')::uuid
  )
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'local'
    AND id = (auth.jwt() -> 'user_metadata' ->> 'local_id')::uuid
  )
);
CREATE POLICY locales_delete ON public.locales FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- =============================================================
-- RLS: PRODUCTOS (el dueño administra SOLO los de su local)
-- =============================================================
DROP POLICY IF EXISTS productos_select ON public.productos;
DROP POLICY IF EXISTS productos_insert ON public.productos;
DROP POLICY IF EXISTS productos_update ON public.productos;
DROP POLICY IF EXISTS productos_delete ON public.productos;

CREATE POLICY productos_select ON public.productos FOR SELECT USING (true);
CREATE POLICY productos_insert ON public.productos FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'local'
    AND local_id = (auth.jwt() -> 'user_metadata' ->> 'local_id')::uuid
  )
);
CREATE POLICY productos_update ON public.productos FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'local'
    AND local_id = (auth.jwt() -> 'user_metadata' ->> 'local_id')::uuid
  )
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'local'
    AND local_id = (auth.jwt() -> 'user_metadata' ->> 'local_id')::uuid
  )
);
CREATE POLICY productos_delete ON public.productos FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'rol') = 'local'
    AND local_id = (auth.jwt() -> 'user_metadata' ->> 'local_id')::uuid
  )
);

-- Verificación: cuántos usuarios de Auth hay por rol
SELECT raw_user_meta_data->>'rol' AS rol, count(*)
FROM auth.users
WHERE raw_user_meta_data->>'rol' IS NOT NULL
GROUP BY 1;

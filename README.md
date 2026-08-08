# ANDÁ · Cadetería

Código fuente de la app ANDÁ (React + Vite + Supabase), desplegada en:
https://cadeteria-tcha1.vercel.app

## ⚠️ SECURIDAD — paquete de hardening (LEER PRIMERO)

La versión anterior dejaba toda la base de datos legible/escribible por cualquiera
(la clave "publishable" del frontend + políticas RLS abiertas). Este repositorio ya
trae el código **endurecido** y, en la carpeta `hardening/`, los scripts de base de
datos para cerrar el acceso de verdad. **El orden importa:**

| Paso | Qué | Cuándo |
|---|---|---|
| 0 | `hardening/migracion.sql` | **proyecto nuevo**: esquema + datos |
| 1 | `hardening/00_revocar_privilegios.sql` | YA (no rompe nada) |
| 2 | `hardening/01_vistas_publicas.sql` | después de desplegar |
| 3 | `hardening/02_usuarios_auth.sql` (editar email/pass de admin) | después de desplegar |
| 4 | `hardening/03_politicas_rls.sql` | **último** — crea las políticas Y activa `ENABLE ROW LEVEL SECURITY` |
| 5 | `hardening/99_verificar.sql` | al final, para comprobar |

### Qué cambió en la app

- **Cadetes y admin ya no entran con contraseñas comparadas en el navegador.**
  Ahora usan cuentas de Supabase Auth:
  - **Admin**: email + contraseña (la cuenta se crea en `02_usuarios_auth.sql`).
  - **Cadete**: elige su nombre y pone la contraseña; por detrás entra con su
    usuario de Auth (email derivado `c.<id>@anda.cadete`, nunca se muestra).
    El usuario de Auth se crea **solo** desde la pestaña Cadetes del panel
    (o con el backfill del script 02).
- **Datos según rol** (RLS):
  - Anónimo: solo catálogo (locales, productos) y tarifas públicas.
  - Cliente: solo sus propios pedidos, su perfil y su chat.
  - Cadete: pedidos asignados a él + los "pendientes" disponibles.
  - Admin: todo.
- **La contraseña de admin ya no vive en la tabla `config`** (la app usa una vista
  pública `v_config_public` para el resto).
- Se corrigió el bug que podía pisar pedidos ajenos (los guardados ya no reescriben
  el listado completo; cada acción toca solo su fila).

### Si ya tenés cadetes cargados

El script `02` hace "backfill": les crea el usuario de Auth automáticamente con la
misma contraseña que tienen cargada. Si querés cambiarle la contraseña a un cadete,
actualizala en la pestaña Cadetes del panel y el trigger la sincroniza.

> Nota: el día que estés seguro, borrá la columna `password` de la tabla `cadetes`
> (queda obsoleta porque el login pasa por Auth). No lo hagas antes de confirmar
> que los cadetes entran bien.

---

## Subir esto a GitHub

1. Entrá a https://github.com/new y creá un repositorio nuevo (por ejemplo `anda-cadeteria`).
2. Desde la carpeta de este proyecto, en una terminal:

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"
git init
git add .
git commit -m "Código endurecido de ANDÁ"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/anda-cadeteria.git
git push -u origin main
```

(Reemplazá `TU_USUARIO`. Te va a pedir iniciar sesión — usá tu usuario y, si pide
contraseña, un Personal Access Token.)

## Conectar Vercel al repositorio (para que despliegue solo)

1. En https://vercel.com/tcha1, entrá al proyecto "cadeteria".
2. **Settings → Git** → conectá el repositorio de GitHub recién creado.
3. Cada push a `main` despliega solo.

Para probar en local antes: `npm install` y `npm run dev`.

## Variables / claves usadas por la app

- Supabase URL: `https://mucojuauxsywwmalcufe.supabase.co` (proyecto exclusivo de ANDÁ)
- Supabase publishable key: en `src/supabaseClient.js` (es pública, pensada para el cliente)
- Clave pública VAPID (notificaciones push): en `src/App.jsx`
- La clave **privada** de VAPID y la función `send-push` viven solo en Supabase
  (Edge Functions), no en este código.

## Migración (proyecto viejo → nuevo)

La app pasó del proyecto compartido `arapzuoqfgezupttuxbe` (que tenía la app de aresa,
con triggers sobre `auth.users` y la tabla `sw_usuarios`) al proyecto exclusivo
`mucojuauxsywwmalcufe`. El script `hardening/migracion.sql` tiene el esquema + datos
de las 9 tablas de ANDÁ para importar en el proyecto nuevo (no se migran suscripciones
push ni datos de aresa). Los usuarios de Auth (admin + cadetes) se crean con el script 02.

## Estructura

- `src/App.jsx` — toda la lógica de la app (4 vistas: landing, cliente, cadete, admin)
- `src/supabaseClient.js` — conexión a Supabase
- `public/` — íconos, manifest.json (PWA) y service worker (sw.js)
- `hardening/` — scripts SQL de seguridad (00 a 99)
- `index.html`, `vite.config.js`, `package.json` — configuración base de Vite

# ANDÁ · Cadetería

Código fuente de la app ANDÁ (React + Vite + Supabase), desplegada en:
https://cadeteria-tcha1.vercel.app

## Subir esto a GitHub

1. Entrá a https://github.com/new y creá un repositorio nuevo (por ejemplo `anda-cadeteria`). No marques "Add a README" para que quede vacío.
2. Descomprimí este ZIP en una carpeta en tu computadora.
3. Abrí una terminal en esa carpeta y ejecutá:

```bash
git init
git add .
git commit -m "Código inicial de ANDÁ"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/anda-cadeteria.git
git push -u origin main
```

(Reemplazá `TU_USUARIO` y el nombre del repo por los tuyos. Te va a pedir que inicies sesión — usá tu usuario y, como contraseña, un Personal Access Token si Git te lo pide en vez de la contraseña normal.)

## Conectar Vercel al repositorio (para que despliegue solo)

1. En https://vercel.com/tcha1, entrá al proyecto "cadeteria".
2. Andá a **Settings → Git** y conectá el repositorio de GitHub que acabás de crear.
3. A partir de ahí, cada vez que subas cambios a la rama `main`, Vercel va a desplegar automáticamente — ya no va a hacer falta que yo suba los archivos a mano.

## Variables / claves usadas por la app

- Supabase URL: `https://arapzuoqfgezupttuxbe.supabase.co`
- Supabase publishable key: ya está en `src/supabaseClient.js` (es pública, pensada para el cliente)
- Clave pública VAPID (notificaciones push): ya está en `src/App.jsx`
- La clave **privada** de VAPID y la función `send-push` viven solo en Supabase (Edge Functions), no en este código.

## Estructura

- `src/App.jsx` — toda la lógica de la app (una sola app con 4 vistas: landing, cliente, cadete, admin)
- `public/` — íconos, manifest.json (PWA) y service worker (sw.js)
- `index.html`, `vite.config.js`, `package.json` — configuración base de Vite

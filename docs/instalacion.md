# Instalación y despliegue

## Desarrollo local

1. Instala Node.js 22 y activa pnpm: `corepack enable`.
2. `pnpm install` en la raíz. Genera también el cliente de Prisma.
3. Levanta PostgreSQL (ver el README) y crea una base de datos, por ejemplo `core_dev`.
4. Copia `apps/api/core-config.env.example` a `apps/api/core-config.env` y rellena:
   - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/core_dev`
   - `NODE_ENV=development` (así no exige `JWT_SECRET` ni bloquea orígenes en CORS)
5. `pnpm build` una vez (compila `@dyc/core` y `@dyc/tokens`) y después `pnpm dev:api`. Al arrancar, la API aplica las migraciones pendientes de `apps/api/migrations/`.
6. En otra terminal, `pnpm dev:web` y abre http://localhost:5173. Vite reenvía `/api` a la API local (cámbialo con `DYC_API_PROXY`).

## Pruebas

```bash
pnpm test                                   # todo
pnpm --filter @dyc/api test                 # solo la API
pnpm --filter @dyc/tokens test              # contraste y tokens
pnpm --filter @dyc/web test                 # componentes y pantallas (sin API)
pnpm e2e                                    # punta a punta: web compilada + API real (requiere pnpm build)
```

El recorrido de punta a punta (`apps/web/e2e/`) arranca la API compilada y `vite preview`, y usa la misma base de datos de pruebas (`E2E_DATABASE_URL` o `TEST_DATABASE_URL`). La primera vez instala Chromium con `pnpm --filter @dyc/web exec playwright install chromium`.

La CI de GitHub Actions (`.github/workflows/ci.yml`) ejecuta typecheck, pruebas con un PostgreSQL 16 y build en cada PR.

## Despliegue de la API en cPanel (Node.js App) + Neon

Es el mismo esquema que ya usa la versión en producción.

1. Genera el paquete: `pnpm build && pnpm --filter @dyc/api bundle`. Se crea `apps/api/release/` con `dist/`, `prisma/`, `migrations/` y un `package.json` sin dependencias internas.
2. Sube el **contenido** de `release/` a la carpeta de la aplicación Node en cPanel, junto con tu `core-config.env` (parte de `core-config.env.example`).
3. En "Setup Node.js App": versión de Node 20 o 22, archivo de inicio `dist/index.js`. Pulsa "Run NPM Install" (instala dependencias y genera Prisma).
4. Reinicia la aplicación y comprueba `https://TU-API/api/health` → `{"ok":true,"service":"core-cloud"}`.

### Migraciones

Al arrancar, la API aplica en orden los archivos de `migrations/` que aún no estén registrados en la tabla `_dyc_migrations`, cada uno en una transacción. En una base que ya tenía la versión original, `001_base` no cambia nada (las tablas ya existen) y `002_pillars` añade las tablas nuevas sin tocar cuentas ni datos. Hay una prueba que simula exactamente esa actualización.

Para cambiar el esquema: edita `prisma/schema.prisma`, genera el SQL con `prisma migrate diff --from-url <base local migrada> --to-schema-datamodel prisma/schema.prisma --script`, guárdalo como el siguiente `NNN_nombre.sql` y ejecuta las pruebas: una de ellas falla si la base migrada no coincide con el esquema.

### Configuración (`core-config.env`)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de Neon **sin** `-pooler` |
| `JWT_SECRET` | Sí en producción | 32+ caracteres aleatorios. Cambiarlo cierra todas las sesiones |
| `CLIENT_ORIGIN` | Sí | Dominio(s) donde se abre la app web. Se usa en CORS y en los enlaces de invitación |
| `PUBLIC_URL` | Recomendada | URL pública de la API; los enlaces de recuperación de contraseña apuntan aquí |
| `ALLOWED_ROOT_DOMAINS` | No | Dominios propios cuyos subdominios pueden usar la API (por defecto `nvcorx.com`) |
| `SMTP_*` | No | Correo de invitación y recuperación. Sin `SMTP_HOST` los enlaces solo se registran en el log |
| `PORT` | No | Puerto o socket; cPanel lo define solo |

## Despliegue de la app web (estática)

La web es una PWA estática: se compila una vez y se sube como archivos.

1. Crea `apps/web/.env.production` a partir de `apps/web/.env.example` con `VITE_API_URL` apuntando a la API pública.
2. `pnpm build`. El resultado queda en `apps/web/dist/`.
3. Sube el **contenido** de `dist/` a la carpeta pública del dominio de la app (por ejemplo `public_html` del subdominio). Incluye `.htaccess`, que hace que rutas como `/progreso` funcionen al recargar y evita que el navegador guarde versiones viejas.
4. En la API, añade el dominio de la web a `CLIENT_ORIGIN` si no es un subdominio de `nvcorx.com`.

La app anterior puede seguir publicada en su dominio mientras tanto: ambas usan la misma cuenta. Si quieres enlazarla desde la sección "Más", pon su URL en `VITE_LEGACY_APP_URL`.

## Despliegue del sitio de marca (estático)

1. Crea `apps/site/.env.production` a partir de `apps/site/.env.example`:
   - `SITE_URL`: el dominio del sitio (se usa en el sitemap y en los enlaces para compartir).
   - `PUBLIC_APP_URL`: la dirección de la app web; los botones «Entrar» y «Crear cuenta» llevan ahí.
   - `PUBLIC_CONTACT_EMAIL` (opcional): si lo pones, aparece en la página de privacidad.
2. `pnpm build`. El resultado queda en `apps/site/dist/`.
3. Sube el **contenido** de `dist/` a la carpeta pública del dominio del sitio. El `.htaccess` incluido hace que `/privacidad` funcione sin `.html` y usa `404.html` para las páginas que no existen.

La imagen para compartir (`public/og.png`) se regenera con `pnpm --filter @dyc/site og`. El texto de privacidad describe lo que la app guarda hoy; conviene que lo revise alguien con criterio legal antes de publicarlo.

### Antes del primer despliegue de esta versión

- **Genera un `JWT_SECRET` nuevo.** El anterior viajó dentro de un ZIP y debe considerarse expuesto. Todos los usuarios tendrán que volver a iniciar sesión una vez.
- **Revisa los dominios.** La app publicada llama a `https://designyourcorebackend.nvcorx.com`, pero la configuración anterior tenía `PUBLIC_URL=https://api.desingyourcore.nvcorx.com` (con "desing"). Si `PUBLIC_URL` no es el dominio real de la API, los enlaces de recuperación de contraseña no abren.
- **Nunca subas `core-config.env` a git.** Está en `.gitignore`.

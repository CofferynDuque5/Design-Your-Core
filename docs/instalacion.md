# Instalación y despliegue

## Desarrollo local

1. Instala Node.js 22 y activa pnpm: `corepack enable`.
2. `pnpm install` en la raíz. Genera también el cliente de Prisma.
3. Levanta PostgreSQL (ver el README) y crea una base de datos, por ejemplo `core_dev`.
4. Copia `apps/api/core-config.env.example` a `apps/api/core-config.env` y rellena:
   - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/core_dev`
   - `NODE_ENV=development` (así no exige `JWT_SECRET` ni bloquea orígenes en CORS)
5. `pnpm dev:api`. Al arrancar, la API crea las tablas si no existen.

## Pruebas

```bash
pnpm test                                   # todo
pnpm --filter @dyc/api test                 # solo la API
pnpm --filter @dyc/tokens test              # contraste y tokens
```

La CI de GitHub Actions (`.github/workflows/ci.yml`) ejecuta typecheck, pruebas con un PostgreSQL 16 y build en cada PR.

## Despliegue de la API en cPanel (Node.js App) + Neon

Es el mismo esquema que ya usa la versión en producción.

1. Compila: `pnpm --filter @dyc/api build`. Se genera `apps/api/dist/`.
2. Sube a la carpeta de la aplicación Node en cPanel: `dist/`, `prisma/`, `package.json` y tu `core-config.env`.
3. En "Setup Node.js App": versión de Node 20 o 22, archivo de inicio `dist/index.js`. Pulsa "Run NPM Install" (instala dependencias y genera Prisma).
4. Reinicia la aplicación y comprueba `https://TU-API/api/health` → `{"ok":true,"service":"core-cloud"}`.

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

### Antes del primer despliegue de esta versión

- **Genera un `JWT_SECRET` nuevo.** El anterior viajó dentro de un ZIP y debe considerarse expuesto. Todos los usuarios tendrán que volver a iniciar sesión una vez.
- **Revisa los dominios.** La app publicada llama a `https://designyourcorebackend.nvcorx.com`, pero la configuración anterior tenía `PUBLIC_URL=https://api.desingyourcore.nvcorx.com` (con "desing"). Si `PUBLIC_URL` no es el dominio real de la API, los enlaces de recuperación de contraseña no abren.
- **Nunca subas `core-config.env` a git.** Está en `.gitignore`.

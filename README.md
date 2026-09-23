# Design Your Core

Plataforma de bienestar personal construida alrededor de seis pilares: energía y movimiento, descanso, alimentación, enfoque mental, relaciones y propósito personal. Un solo backend da servicio a la app web, al sitio de marca y a la app móvil.

## Estado

| Parte | Carpeta | Estado |
|---|---|---|
| Cliente de la API | `packages/api-client` | Cliente tipado de la API, compartido por la web y la app móvil |
| API | `apps/api` | v1 compatible con la app actual + v2 con pilares, check-ins, hábitos con historial, retos, panel y recomendaciones. Pruebas de integración |
| Lógica compartida | `packages/core` | Pilares, fechas, validación, puntuaciones, catálogo de retos y recomendaciones. La usan la API, la web y la app móvil |
| Sistema de diseño | `packages/tokens` | Tokens (color, tipografía, espaciado, pilares) y componentes CSS base. [Guía visual](docs/design-system/index.html) |
| App web | `apps/web` | PWA en React: acceso, onboarding, Hoy, check-in, hábitos, retos, progreso día/semana/mes, perfil y ajustes, sección Más. Pruebas de componentes y de punta a punta |
| Sitio de marca | `apps/site` | Astro estático: portada con los seis pilares, cómo funciona, principios, privacidad y 404. Pruebas del HTML generado (enlaces, títulos, accesibilidad básica) |
| App móvil | `apps/mobile` | Pendiente (etapa 5, Expo) |

El diagnóstico completo, la arquitectura y el plan por etapas están en [docs/diagnostico.md](docs/diagnostico.md).

## Requisitos

- Node.js 22.12 o superior (ver `.nvmrc`; el sitio usa Astro 7)
- pnpm 10 (`corepack enable`)
- PostgreSQL 14+ para desarrollo y pruebas (en producción se usa Neon)

## Empezar

```bash
corepack enable
pnpm install
pnpm build       # primero: la API usa los paquetes internos compilados
pnpm typecheck
pnpm test        # necesita PostgreSQL, ver abajo
```

### Base de datos para pruebas

Las pruebas de la API usan una base de datos real y la **vacían en cada prueba**. Por defecto se conectan a `postgresql://postgres:postgres@localhost:5432/core_test`; cámbialo con `TEST_DATABASE_URL`.

Con Docker:

```bash
docker run -d --name dyc-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=core_test -p 5432:5432 postgres:16
```

### API en local

```bash
cp apps/api/core-config.env.example apps/api/core-config.env   # y edítalo
pnpm dev:api                                                   # http://localhost:4600/api/health
```

### App web en local

Con la API en marcha:

```bash
pnpm dev:web                                                   # http://localhost:5173
```

Vite reenvía `/api` a `localhost:4600`, así que no hace falta configurar CORS en desarrollo.

### Sitio de marca en local

```bash
pnpm dev:site                                                  # http://localhost:4321
```

Más detalles en [docs/instalacion.md](docs/instalacion.md) y la referencia de endpoints en [docs/api.md](docs/api.md).

## Estructura

```
apps/
  api/            Express + Prisma + PostgreSQL (migrations/ se aplican al arrancar)
  web/            React + Vite + PWA (TanStack Query, React Router)
  site/           Sitio de marca (Astro, estático)
packages/
  api-client/     Cliente tipado de la API (web y móvil)
  core/           Dominio compartido (sin dependencias de UI)
  tokens/         Design tokens → CSS y tema para React Native
docs/
  design-system/  Guía visual generada desde los tokens
```

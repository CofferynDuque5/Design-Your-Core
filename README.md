# Design Your Core

Plataforma de bienestar personal construida alrededor de seis pilares: energía y movimiento, descanso, alimentación, enfoque mental, relaciones y propósito personal. Un solo backend da servicio a la app web, al sitio de marca y a la app móvil.

## Estado

| Parte | Carpeta | Estado |
|---|---|---|
| API | `apps/api` | Reconstruida en TypeScript desde la versión en producción, compatible con la app actual, con pruebas de integración |
| Sistema de diseño | `packages/tokens` | Tokens (color, tipografía, espaciado, pilares) y componentes CSS base. [Guía visual](docs/design-system/index.html) |
| App web | `apps/web` | Pendiente (etapa 3) |
| Sitio de marca | `apps/site` | Pendiente (etapa 4) |
| App móvil | `apps/mobile` | Pendiente (etapa 5, Expo) |

El diagnóstico completo, la arquitectura y el plan por etapas están en [docs/diagnostico.md](docs/diagnostico.md).

## Requisitos

- Node.js 20 o superior (recomendado 22, ver `.nvmrc`)
- pnpm 10 (`corepack enable`)
- PostgreSQL 14+ para desarrollo y pruebas (en producción se usa Neon)

## Empezar

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test        # necesita PostgreSQL, ver abajo
pnpm build
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

Más detalles en [docs/instalacion.md](docs/instalacion.md) y la referencia de endpoints en [docs/api.md](docs/api.md).

## Estructura

```
apps/
  api/            Express + Prisma + PostgreSQL
packages/
  tokens/         Design tokens → CSS y tema para React Native
docs/
  design-system/  Guía visual generada desde los tokens
```

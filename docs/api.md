# API (v1)

Base: `https://TU-API`. Todas las respuestas son JSON salvo `/reset`. Las rutas con 🔒 requieren `Authorization: Bearer <token>`. Las rutas marcadas "estricta" admiten 20 peticiones cada 15 minutos por IP; el resto de `/api`, 600.

Esta versión es compatible con la app publicada actualmente. El plan añade `/api/v2` (pilares, check-ins, retos, recomendaciones) sin romper estas rutas.

## Salud

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/health` | `{ ok: true, service: "core-cloud" }` |

## Cuenta y sesión

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/auth/register` (estricta) | `{ email, password (8+), name?, gender? ('mujer'\|'hombre'\|'otro') }` | `{ token, user }` · 409 si el correo existe |
| POST | `/api/auth/login` (estricta) | `{ email, password }` | `{ token, user }` · 401 si no coincide |
| GET | `/api/me` 🔒 | | `{ user }` |
| PATCH | `/api/v2/me` 🔒 | `{ showCycle }` (booleano) | `{ user }`. Es el mismo ajuste `showCycle` de la app anterior: muestra Ciclo en el menú y en el Calendario |
| POST | `/api/auth/change-password` 🔒 (estricta) | `{ current, next (8+) }` | `{ ok, token }`. Cierra las demás sesiones |
| POST | `/api/auth/logout-others` 🔒 | | `{ ok, token }`. Cierra las demás sesiones |
| POST | `/api/auth/forgot-password` (estricta) | `{ email }` | Siempre `{ ok, message }`. Envía un enlace válido 30 min |
| GET | `/reset?token=` | | Página HTML para elegir contraseña |
| POST | `/reset` (estricta) | formulario `token`, `next` | Página HTML de resultado. Cierra todas las sesiones |

`user` = `{ id, email, name, gender, showCycle }`. El token dura 60 días y deja de valer si la contraseña cambia o se cierran las demás sesiones.

## Sincronización

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/sync` 🔒 | | `{ data, updatedAt }` |
| PUT | `/api/sync` 🔒 | `{ data: {…} }` | `{ ok, updatedAt }`. Reemplaza el documento completo |

## Imágenes

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/images` 🔒 | | `{ ids: [] }` |
| POST | `/api/images` 🔒 | `{ images: { id: dataURL } }` (máx. 50, 4 MB c/u) | `{ ok, count }`. Ignora ids de otra persona |
| POST | `/api/images/fetch` 🔒 | `{ ids: [] }` (máx. 100) | `{ images: { id: dataURL } }` |

## Pareja

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/partner/invite` 🔒 | | `{ code }` (6 caracteres) |
| POST | `/api/partner/invite/email` 🔒 (estricta) | `{ email, appUrl }` | `{ ok, code, sent }` |
| POST | `/api/partner/accept` 🔒 (estricta) | `{ code }` | `{ ok, partner: { name } }` |
| GET | `/api/partner` 🔒 | | `{ partner: null }` o `{ partner: { name }, habits, doneToday, total }` |
| DELETE | `/api/partner` 🔒 | | `{ ok }` |

`appUrl` se respeta si su dominio está en `CLIENT_ORIGIN` o es un subdominio de `ALLOWED_ROOT_DOMAINS`; si no, se usa el primer `CLIENT_ORIGIN`.

## Errores

`{ error: "mensaje para mostrar" }` con 400 (datos), 401 (sesión), 404, 409 (conflicto), 429 (demasiados intentos) o 500.

# API v2: pilares

Base `/api/v2`, todas las rutas con 🔒 salvo las de sesión. Las fechas son el día local de la persona en formato `AAAA-MM-DD`; "hoy" se calcula con la zona horaria del perfil. Los pilares son `movimiento`, `descanso`, `alimentacion`, `enfoque`, `relaciones` y `proposito`, siempre en ese orden. La validación compartida está en `@dyc/core` (`packages/core/src/schemas.ts`). Un error de validación responde 400 con `{ error, issues }`.

## Perfil y onboarding

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/profile` | | `{ profile }` |
| PUT | `/profile` | Cualquier subconjunto de `focusPillars` (máx. 3), `intention`, `energyLevel` (1–5), `activityLevel` (`sedentaria`\|`ligera`\|`moderada`\|`alta`), `wakeTime`/`bedTime` (`HH:MM`), `timezone` (IANA), `baseline` ({pilar: 1–5}), `completeOnboarding` | `{ profile }` con `onboarded` |

## Check-in diario

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/checkins?from=&to=` | (por defecto, últimos 30 días; máx. un año) | `{ from, to, checkIns }` |
| PUT | `/checkins/:date` | Cualquier subconjunto de `mood`, `energy`, `stress`, `sleepQuality`, `nutrition`, `connection`, `purpose` (1–5), `sleepHours` (0–24), `activeMinutes`, `water` (vasos), `note`, `gratitude`. Se fusiona con lo existente; `null` borra un campo | `{ checkIn }` |
| DELETE | `/checkins/:date` | | `{ ok }` |

## Hábitos

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/habits` (`?archived=1` incluye archivados) | | `{ today, habits }` con `recent` (últimos 7 días) |
| POST | `/habits` | `{ title, pillar, days? }` (`days` ISO, "12345" = entre semana) | 201 `{ habit }` |
| PATCH | `/habits/:id` | `{ title?, pillar?, days?, archived? }` | `{ habit }` |
| DELETE | `/habits/:id` | | `{ ok }`. Borra también el historial |
| PUT | `/habits/:id/logs/:date` | `{ done }` | `{ log }` |

## Retos

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/challenges/catalog` | | `{ challenges }`: 24 retos, 4 por pilar, con niveles 1–3 |
| GET | `/challenges` | | `{ today, active, past }` con progreso (`dayNumber`, `doneDays`, `doneToday`, `log`) |
| POST | `/challenges` | `{ key, startOn?, replaces? }` | 201 `{ challenge }`. Máx. 3 activos; `replaces` cambia uno activo por otro (subir o bajar de nivel) |
| PATCH | `/challenges/:id` | `{ status: 'completed' \| 'abandoned' }` | `{ challenge }` |
| PUT | `/challenges/:id/logs/:date` | `{ done }` | `{ challenge }` |

Los retos cuyo plazo terminó pasan solos a `completed`.

## Panel y recomendaciones

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/dashboard?period=day\|week\|month&date=` | `overall`, `pillars` (puntuación 0–100, anterior y variación), `series` diaria, `habits`, `checkIns` (cantidad y racha), `todayStatus`, `challenges` activos, `recommendations`, `onboarded` |
| GET | `/recommendations` | `{ recommendations }`: hasta 3, cada una con `reason` (el dato que la motiva) y `action` |
| POST | `/recommendations/:key/dismiss` | `{ ok, until }`. La oculta 7 días |

**Puntuación.** Cada pilar sale del check-in del día (sueño y calidad para descanso; minutos activos y energía para movimiento; alimentación y agua; ánimo y estrés para enfoque; conexión para relaciones; propósito y reflexión escrita para propósito) combinado con sus hábitos: 70 % check-in y 30 % hábitos cuando hay ambos. Lo que no se registró queda en `null` y no baja la media. Ver `packages/core/src/scoring.ts`.

## Cuenta

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/account/export` | | JSON descargable con todos los datos, incluido el documento v1 |
| DELETE | `/account` (estricta) | `{ password }` | `{ ok }`. Borra la cuenta y sus datos y desvincula a la pareja |

## Sesiones renovables (app móvil)

La app móvil no guarda un token de 60 días: recibe un **token de acceso de 15 minutos** (JWT, vale en todas las rutas 🔒, también las de v1) y un **token de renovación** opaco de 90 días que cambia en cada uso. El servidor solo guarda su hash. Si se usa un token de renovación ya cambiado, se cierra toda esa sesión. Cambiar la contraseña o «cerrar sesión en otros dispositivos» también invalida las renovaciones.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/auth/register` (estricta) | `{ email, password (8+), name?, device? }` | 201 `{ accessToken, refreshToken, expiresIn, user }` |
| POST | `/auth/session` (estricta) | `{ email, password, device? }` | `{ accessToken, refreshToken, expiresIn, user }` |
| POST | `/auth/refresh` | `{ refreshToken }` | Un par nuevo. 401 si caducó, se revocó o se reutilizó |
| POST | `/auth/logout` | `{ refreshToken }` | `{ ok }`. Cierra esa sesión |

## Dispositivos (notificaciones push)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| PUT | `/devices` 🔒 | `{ token, platform: ios\|android\|web }` | `{ ok }`. Si el token ya era de otra cuenta, pasa a esta |
| DELETE | `/devices/:token` 🔒 | | `{ ok }` |

## Cambio en v1: sincronización sin sobrescrituras

`PUT /api/sync` acepta ahora `baseUpdatedAt` (el `updatedAt` que el cliente leyó). Si el documento cambió desde entonces en otro dispositivo, responde 409 con `{ error, data, updatedAt }` en lugar de pisarlo. Sin ese campo se comporta como antes, así que la app publicada sigue funcionando.

## Módulos de la app anterior

Edición elemento a elemento de las listas `blocks`, `tasks`, `todos`, `subtasks`, `reminders`, `classes`, `focus`, `subjects`, `projects`, `roadmaps`, `notebooks`, `noteBoxes`, `content`, `ideas`, `transactions`, `goals`, `pets`, `petCares`, `period`, `workouts`, `sleep`, `journal`, `routines`, `meals`, `notes`, `workItems` y `meditations` del documento de `/api/sync`, en `/api/v2/modules`. Las claves que son un objeto (`cycle`, `dayLog` y `budget`) se guardan enteras con `PUT /modules/:key` o en parte con `PATCH /modules/:key`, y responden `{ value, updatedAt }`. En `notes`, `excerpt` y `tag` los calcula el servidor.

La **bóveda cifrada** (`vaultSecure`, clave nueva) tiene rutas propias; el servidor solo valida la forma, nunca ve el contenido:

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| PUT | `/api/v2/modules/vaultSecure` 🔒 | `{ v: 1, kdf, check, items: [] }` | 201 `{ value, updatedAt }` · 409 si ya existe |
| DELETE | `/api/v2/modules/vaultSecure` 🔒 | | `{ ok, updatedAt }` (la lista antigua `vault` no se toca) |
| POST | `/api/v2/modules/vaultSecure/items` 🔒 | `{ item: { id, iv, ct } }` | 201 `{ item, updatedAt }` · 404 sin bóveda · 409 id repetido |
| PUT | `/api/v2/modules/vaultSecure/items/:id` 🔒 | `{ iv, ct }` | `{ item, updatedAt }` · 404 |
| DELETE | `/api/v2/modules/vaultSecure/items/:id` 🔒 | | `{ ok, updatedAt }` · 404 |
| POST | `/api/v2/modules/vaultSecure/migrate` 🔒 | `{ items, legacyIds }` | `{ migrated, remaining, updatedAt }`: añade las entradas cifradas y quita de `vault` las de `legacyIds` en la misma escritura |

Formatos, validación y reglas: ver [modulos.md](modulos.md).

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

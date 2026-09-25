# Módulos de la app anterior en la app nueva

La app anterior ("Core") guarda todo el estado de cada persona en **un solo documento JSON** (tabla `Blob`, rutas v1 `GET/PUT /api/sync`). La app nueva recupera sus secciones por tandas, leyendo y escribiendo **ese mismo documento**, así que la app anterior sigue funcionando y los datos que ya existen aparecen sin migrar nada.

| Tanda | Secciones | Rutas web | Claves del documento |
|---|---|---|---|
| 1 | Agenda, Pendientes, Calendario, Horario, Enfoque | `/agenda` (`?vista=tareas`), `/pendientes`, `/calendario`, `/horario`, `/enfoque` | `blocks`, `tasks`, `todos`, `subtasks`, `reminders`, `classes`, `focus` |

El resto de secciones aparece en **Más** con su número de elementos y un enlace a la app anterior hasta que lleguen. El estudio completo de formatos está en `diagnostico/modulos-app-anterior.md` (carpeta del proyecto).

## API: `/api/v2/modules` 🔒

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/modules` | | `{ data, updatedAt }` (lo mismo que `GET /api/sync`) |
| POST | `/modules/:key` | `{ item }` con `id` del cliente (`crypto.randomUUID()`) | 201 `{ item, updatedAt }` · 409 si el id ya existe |
| PATCH | `/modules/:key/:id` | Campos a cambiar | `{ item, updatedAt }` · 404 si no existe |
| DELETE | `/modules/:key/:id` | | `{ ok, updatedAt }`. Borrar un `todos` borra sus `subtasks` |
| PUT | `/modules/:key/order` | `{ ids }` | `{ ok, updatedAt }`. Primero los ids dados; el resto conserva su orden al final |

`:key` es una de `blocks`, `tasks`, `todos`, `subtasks`, `reminders`, `classes`, `focus` (otra clave responde 404). En `focus` el elemento nuevo va **al principio** y la lista se corta en 500, como hace la app anterior; en las demás va al final.

La validación está en `@dyc/core` (`packages/core/src/legacy.ts`) y reproduce los formatos antiguos:

| Clave | Campos |
|---|---|
| `blocks` | `label`, `sub`, `start` y `dur` en **horas decimales** (8.5 = 8:30; no puede pasar de 24), `kind` `ex`\|`study`\|`class`\|`project`\|`break`\|`read` |
| `tasks` | `title`, `pri` `alta`\|`media`\|`baja`, `time` `HH:MM` o `null`, `rem` (= `!!time`), `done`, `tags` |
| `todos` / `subtasks` | `title`, `done`; `subtasks.todoId` debe existir en `todos` |
| `reminders` | `day` = **día del mes 1–31** (se repite todos los meses), `title`, `when` (texto libre), `color` de `#0FA968 #4F7CFF #EC6A9C #8B5CF6 #E8912A #E5484D`, `icon`, `on` |
| `classes` | `day` 1–7 (lunes a domingo), `start`/`end` `HH:MM` con fin posterior al inicio, `title`, `room`, `color` hex, `subject` = id de `subjects` o `""` |
| `focus` | `mode` `focus`\|`short`\|`long`, `seconds` entero ≥ 1, `dateKey` `AAAA-MM-DD` **en UTC** |

Al crear se completan los valores por defecto de la app anterior (`kind: "study"`, `pri: "media"`, `color`, `icon: "doc"`, `on: true`…). Los campos desconocidos se rechazan al crear o cambiar, pero un PATCH **conserva** los que ya estuvieran guardados en el elemento.

## Reglas de compatibilidad

- **Cada escritura es atómica**: bloquea la fila del documento (`SELECT … FOR UPDATE`), cambia solo su clave y guarda. Las demás claves, también las que la app nueva no conoce, se conservan tal cual. Si el documento no existe, se crea.
- **Formatos intactos**: no se añaden campos nuevos a los elementos. Si algún día hace falta (por ejemplo, una fecha completa para los eventos), será un campo nuevo y opcional.
- **Claves que faltan = lista vacía**, como en la app anterior (`x || []`).
- Cada escritura cambia `updatedAt`, así que la app anterior detecta el cambio si envía `baseUpdatedAt`. La app anterior publicada **no lo envía**: sigue guardando el documento completo y gana la última escritura. Si alguien usa las dos apps a la vez, lo que la app anterior tenga en memoria puede pisar un cambio hecho en la nueva (y al revés al recargar). Es el mismo comportamiento que ya tenía entre dos dispositivos.
- Horas: `blocks` usa horas decimales y `classes` texto `HH:MM`. Enfoque guarda el día en UTC; Calendario y Horario trabajan con la hora local, igual que la app anterior.

## En la web

- Una sola consulta (`useLegacyData`, clave `['legacy']`) alimenta las cinco herramientas y **Más**.
- Los cambios se ven al instante y se envían en orden (una cola por documento); si la API falla, se deshacen y aparece un aviso.
- Enfoque: 25 / 5 / 15 minutos; tras cada cuarta sesión de enfoque completada toca descanso largo. Se guarda un registro al terminar o al saltar (si pasó al menos 1 s); reiniciar no guarda. El temporizador vive en la página: si sales de ella, se detiene.

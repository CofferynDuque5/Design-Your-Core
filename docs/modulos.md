# Módulos de la app anterior en la app nueva

La app anterior ("Core") guarda todo el estado de cada persona en **un solo documento JSON** (tabla `Blob`, rutas v1 `GET/PUT /api/sync`). La app nueva recupera sus secciones por tandas, leyendo y escribiendo **ese mismo documento**, así que la app anterior sigue funcionando y los datos que ya existen aparecen sin migrar nada.

| Tanda | Secciones | Rutas web | Claves del documento |
|---|---|---|---|
| 1 | Agenda, Pendientes, Calendario, Horario, Enfoque | `/agenda` (`?vista=tareas`), `/pendientes`, `/calendario`, `/horario`, `/enfoque` | `blocks`, `tasks`, `todos`, `subtasks`, `reminders`, `classes`, `focus` |
| 2 | Materias, Proyectos, Roadmaps, Cuadernos, Contenido, Ideas | `/materias`, `/proyectos`, `/roadmaps`, `/cuadernos` (y `/cuadernos/:id`), `/contenido`, `/ideas` | `subjects`, `projects`, `roadmaps`, `notebooks`, `noteBoxes`, `content`, `ideas` |
| 3 | Finanzas, Metas, Mascotas, Ciclo, Ejercicio, Sueño, Diario, Rutina | `/finanzas`, `/metas`, `/mascotas`, `/ciclo`, `/ejercicio`, `/sueno`, `/diario`, `/rutina` | `transactions`, `budget`, `goals`, `pets`, `petCares`, `period`, `cycle`, `workouts`, `sleep`, `journal`, `routines`, `meals`, `dayLog` |
| 4 | Notas, Bóveda, Asistente, Trabajo, Respiración | `/notas` (y `/notas/:id`), `/boveda`, `/asistente`, `/trabajo`, `/respiracion` | `notes`, `vaultSecure` (nueva) y `vault`, `workItems`, `meditations`; el Asistente escribe en las claves de sus herramientas |

Con la tanda 4 están **todas** las secciones de la app anterior: **Más** es el centro de todas las herramientas, agrupadas como en la barra lateral y con su número de elementos, y ya no hay apartado «Llegan pronto». Si la web se compila con `VITE_LEGACY_APP_URL`, **Más** mantiene el botón «Abrir la app anterior». El estudio completo de formatos está en `diagnostico/modulos-app-anterior.md` (carpeta del proyecto).

## API: `/api/v2/modules` 🔒

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/modules` | | `{ data, updatedAt }` (lo mismo que `GET /api/sync`) |
| POST | `/modules/:key` | `{ item }` con `id` del cliente (`crypto.randomUUID()`) | 201 `{ item, updatedAt }` · 409 si el id ya existe |
| PATCH | `/modules/:key/:id` | Campos a cambiar | `{ item, updatedAt }` · 404 si no existe |
| DELETE | `/modules/:key/:id` | | `{ ok, updatedAt }`. Borrar un `todos` borra sus `subtasks` y un `notebooks` sus `noteBoxes` |
| PUT | `/modules/:key/order` | `{ ids }` | `{ ok, updatedAt }`. Primero los ids dados; el resto conserva su orden al final |
| PUT | `/modules/:key` (objetos) | El objeto completo | `{ value, updatedAt }`. Solo para `cycle`, `dayLog` y `budget` |
| PATCH | `/modules/:key` (objetos) | Campos a cambiar | `{ value, updatedAt }`. Se fusiona sobre lo guardado y los valores por defecto |

`:key` es una lista: `blocks`, `tasks`, `todos`, `subtasks`, `reminders`, `classes`, `focus`, `subjects`, `projects`, `roadmaps`, `notebooks`, `noteBoxes`, `content`, `ideas`, `transactions`, `goals`, `pets`, `petCares`, `period`, `workouts`, `sleep`, `journal`, `routines`, `meals`, `notes`, `workItems` o `meditations` (otra clave responde 404, y las rutas de listas con una clave de objeto también). Como hace la app anterior, en `focus` (500), `transactions` (2000), `workouts` (400), `sleep` (400) y `meditations` (400) el elemento nuevo va **al principio** y la lista se corta en ese máximo; en las demás va al final. `period` y `journal` admiten **un solo registro por fecha**: repetir la fecha responde 409.

Las claves que son **un objeto** no son listas: `cycle`, `dayLog` y `budget`. `PUT` las sustituye enteras y `PATCH` cambia solo los campos enviados; en los dos casos se valida el resultado, la escritura es atómica igual que en las listas, las demás claves del documento no se tocan y los campos del objeto que la app nueva no conoce se conservan.

La validación está en `@dyc/core` (`packages/core/src/legacy.ts`) y reproduce los formatos antiguos:

| Clave | Campos |
|---|---|
| `blocks` | `label`, `sub`, `start` y `dur` en **horas decimales** (8.5 = 8:30; no puede pasar de 24), `kind` `ex`\|`study`\|`class`\|`project`\|`break`\|`read` |
| `tasks` | `title`, `pri` `alta`\|`media`\|`baja`, `time` `HH:MM` o `null`, `rem` (= `!!time`), `done`, `tags` |
| `todos` / `subtasks` | `title`, `done`; `subtasks.todoId` debe existir en `todos` |
| `reminders` | `day` = **día del mes 1–31** (se repite todos los meses), `title`, `when` (texto libre), `color` de `#0FA968 #4F7CFF #EC6A9C #8B5CF6 #E8912A #E5484D`, `icon`, `on` |
| `classes` | `day` 1–7 (lunes a domingo), `start`/`end` `HH:MM` con fin posterior al inicio, `title`, `room`, `color` hex, `subject` = id de `subjects` o `""` |
| `focus` | `mode` `focus`\|`short`\|`long`, `seconds` entero ≥ 1, `dateKey` `AAAA-MM-DD` **en UTC** |
| `subjects` | `name`, `teacher`, `room`, `color` hex (por defecto `#4F7CFF`), `nextClass` (**texto libre**, «Lunes 8:00»), `topics: [{ id, name, done }]` |
| `projects` | `title`, `subject` = **nombre** de la materia (no su id) o `""`, `deadline` (**texto libre**, «20 SEP»), `status` `curso`\|`revision`\|`entregado`, `color` hex, `milestones: [{ id, name, date: "", done }]` |
| `roadmaps` | `name`, `color` hex (por defecto `#8B5CF6`), `steps: [{ id, name, done }]` |
| `notebooks` | `title` (por defecto «Cuaderno»), `category` (por defecto «General»), `subject` y `topic` (texto libre), `color` hex, `emoji` |
| `noteBoxes` | `notebookId` (debe existir en `notebooks`), `title`, `text`, `color` hex, `kind` `text`\|`code`, `lang` (`""` en texto; `js` por defecto en código) |
| `content` | `title`, `stage` `idea`\|`guion`\|`grabar`\|`editar`\|`publicado`, `platform` `youtube`\|`tiktok`\|`instagram`\|`otro`, `notes`, `script`, `due` (texto libre, «12 sep») |
| `ideas` | `title`, `body`, `category` `app`\|`web`\|`marketing`\|`otro`, `tags` (texto separado por comas) |
| `transactions` | `date` `AAAA-MM-DD` **en UTC**, `amount` ≥ 0 (el signo lo da `type`), `type` `expense`\|`income`, `category` (texto; la web ofrece Comida, Transporte, Ocio, Hogar, Salud, Estudio, Otro o Sueldo, Freelance, Contenido, Regalo, Otro), `note` |
| `goals` | `title`, `target` entero ≥ 1, `current` entero ≥ 0, `unit`, `deadline` `AAAA-MM-DD` o `""`, `category` `salud`\|`dinero`\|`estudio`\|`creador`\|`personal`, `done` |
| `pets` | `name`, `species` `dog`\|`cat`\|`rabbit`\|`hamster`\|`bird`\|`fish`\|`turtle`\|`horse`\|`cow`\|`pig`\|`chicken`\|`reptile`\|`other`, `note` |
| `petCares` | `petId` (debe existir en `pets`), `kind` `comida`\|`agua`\|`paseo`\|`vet`\|`otro`, `title`, `time` `HH:MM` o `""`, `days` (ver abajo), `sound`, `enabled`, `lastDone` `AAAA-MM-DD` (UTC) o `""` |
| `period` | `date` `AAAA-MM-DD` **en hora local**, `flow` `light`\|`medium`\|`heavy`, `symptoms` (texto separado por «, »), `mood` (emoji o `""`), `note` |
| `workouts` | `date` (UTC), `plan` (texto), `minutes` entero 1–1440 |
| `sleep` | `date` (UTC, el día en que te despiertas), `bedtime` y `waketime` `HH:MM` (si la hora de levantarse es menor, cruza la medianoche), `quality` 1–5, `note` |
| `journal` | `date` (UTC), `mood` (emoji o `""`), `gratitude`, `note` |
| `routines` | `title`, `time` `HH:MM`, `days`, `icon` (por defecto `bell`), `sound`, `enabled` |
| `meals` | `label` (por defecto «Comida»; la web ofrece Desayuno, Comida, Cena y Snack), `time` `HH:MM` o `""`, `note`, `dateKey` (UTC) |
| `notes` | `title` (por defecto «Nota sin título»), `subject` (materia en texto libre, por defecto «General»), `date` (**texto para mostrar**, «25 sept», no una fecha), `tag` (color), `excerpt`, `body` (Markdown, hasta ~6 MB porque puede llevar imágenes en base64), `commit`, `tags` (texto separado por comas), `shareId` (`null` o el id que puso la app anterior; la app nueva **no lo cambia**) |
| `workItems` | `title`, `project` `p1`\|`p2`\|`p3` (los tres proyectos fijos de la app anterior), `status` `todo`\|`curso`, `done`, `due` (texto libre) |
| `meditations` | `date` (UTC), `minutes` entero 0–1440, `kind` (por defecto `respiracion`) |

`days` es el texto de la app anterior con los días en que toca: `"1234567"`, con **1 = lunes** y 7 = domingo, cada día una sola vez y al menos uno.

| Objeto | Campos |
|---|---|
| `cycle` | `cycleLength` 15–60 (por defecto 28), `periodLength` 1–14 (por defecto 5) |
| `dayLog` | `dateKey` (UTC), `water` 0–40, `waterGoal` 1–40 (por defecto 8). Si `dateKey` no es hoy, el agua de hoy cuenta desde 0 y la meta se conserva |
| `budget` | `monthly` ≥ 0. **Clave nueva**: la app anterior guardaba el presupuesto solo en el `localStorage` del navegador (`core_budget`); la app nueva lo guarda en el documento y, si aún no hay, ofrece ese valor del navegador como sugerencia al definirlo. `monthly: 0` = sin presupuesto |

En `notes`, **`excerpt` y `tag` los calcula siempre el servidor** (y la web al instante, con la misma función `deriveLegacyPatch`): `excerpt` = los primeros 90 caracteres de `body` y `tag` = el color de la materia con la fórmula de la app anterior (`#0FA968 #4F7CFF #EC6A9C #8B5CF6 #E8912A`, según la longitud y la primera letra). Si llegan en un POST se ignoran, y un PATCH no los acepta. La app anterior no cambiaba `tag` al cambiar la materia; la app nueva sí, para que el color siga a la materia.

### Bóveda cifrada: `vaultSecure`

La bóveda de la app anterior (`vault`: `{ id, name, mono, user, pass }`) guarda las contraseñas **en texto plano** dentro del documento, que viaja completo en `/api/sync` y en las copias de seguridad. La app nueva no la reutiliza: guarda una bóveda **cifrada en el navegador** en una clave nueva, `vaultSecure`:

```json
{ "v": 1,
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<16 bytes base64>" },
  "check": { "iv": "<12 bytes base64>", "ct": "<base64>" },
  "items": [{ "id": "…", "iv": "<12 bytes base64>", "ct": "<base64>" }] }
```

- Solo Web Crypto: la contraseña maestra pasa por PBKDF2-SHA-256 (sal aleatoria de 16 bytes, al menos 600 000 iteraciones) y da una clave AES-GCM de 256 bits que no se puede exportar. Cada entrada se cifra con **su propio IV aleatorio de 12 bytes** y el id de la entrada como dato autenticado, así que un cifrado no se puede mover a otra entrada. `ct` descifrado es el JSON `{ name, mono, user, pass, url?, note? }`. `check` cifra un texto fijo y sirve para saber si la contraseña maestra es la buena.
- La contraseña maestra y la clave **nunca salen del navegador**. El servidor solo valida la forma con zod estricto (versión, iteraciones, longitudes exactas de sal e IV, base64 y tamaño máximo; hasta 2000 entradas) y nunca ve el contenido.
- **Si se pierde la contraseña maestra, se pierden las entradas**: no hay recuperación. «¿Olvidaste la contraseña maestra?» solo permite borrar la bóveda y crear otra.
- Se bloquea sola tras 5 minutos sin actividad, al salir de la página y al salir de la sección; lo descifrado solo vive en memoria.
- La app anterior no conoce `vaultSecure`: no ve la bóveda cifrada (y conserva la clave al guardar el documento, porque guarda todo lo que recibe).

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| PUT | `/modules/vaultSecure` | La bóveda completa (se crea vacía) | 201 `{ value, updatedAt }` · 409 si ya hay una |
| DELETE | `/modules/vaultSecure` | | `{ ok, updatedAt }`. Borra la bóveda cifrada; `vault` no se toca |
| POST | `/modules/vaultSecure/items` | `{ item: { id, iv, ct } }` | 201 `{ item, updatedAt }` · 404 sin bóveda · 409 si el id existe |
| PUT | `/modules/vaultSecure/items/:id` | `{ iv, ct }` (IV nuevo en cada cambio) | `{ item, updatedAt }` · 404 |
| DELETE | `/modules/vaultSecure/items/:id` | | `{ ok, updatedAt }` · 404 |
| POST | `/modules/vaultSecure/migrate` | `{ items, legacyIds }` | `{ migrated, remaining, updatedAt }`: añade las entradas ya cifradas y quita de `vault` las de `legacyIds`, **en la misma escritura** |

**Migración de las contraseñas sin cifrar.** Si `vault` tiene entradas con contraseña, la Bóveda avisa de cuántas hay guardadas sin cifrar. Con la bóveda desbloqueada ofrece «Cifrar y borrar las copias sin cifrar»: antes explica que después la bóveda de la app anterior aparecerá vacía, y solo al confirmarlo cifra cada entrada en el navegador y llama a `migrate`, que deja `vault` en `[]`. **Nunca se hace sola.** Si otro navegador tiene abierta la app anterior con una copia vieja y la vuelve a subir, el aviso reaparece y se puede repetir.

**Temas, hitos y pasos** (`topics`, `milestones`, `steps`) van dentro de su elemento, como en la app anterior: se cambian con un PATCH del elemento que lleva **la lista completa** (`{ "topics": [...] }`). Cada subelemento se valida (`id` antiguo o `crypto.randomUUID()`, `name`, `done`; en hitos también `date`) y se fusiona con el guardado de su mismo id, así que los campos que la app nueva no conoce se conservan.

Al crear se completan los valores por defecto de la app anterior (`kind: "study"`, `pri: "media"`, `color`, `icon: "doc"`, `on: true`…). Los campos desconocidos se rechazan al crear o cambiar, pero un PATCH **conserva** los que ya estuvieran guardados en el elemento.

## Reglas de compatibilidad

- **Cada escritura es atómica**: bloquea la fila del documento (`SELECT … FOR UPDATE`), cambia solo su clave y guarda. Las demás claves, también las que la app nueva no conoce, se conservan tal cual. Si el documento no existe, se crea.
- **Formatos intactos**: no se añaden campos nuevos a los elementos. Si algún día hace falta (por ejemplo, una fecha completa para los eventos), será un campo nuevo y opcional.
- **Claves que faltan = lista vacía**, como en la app anterior (`x || []`).
- Cada escritura cambia `updatedAt`, así que la app anterior detecta el cambio si envía `baseUpdatedAt`. La app anterior publicada **no lo envía**: sigue guardando el documento completo y gana la última escritura. Si alguien usa las dos apps a la vez, lo que la app anterior tenga en memoria puede pisar un cambio hecho en la nueva (y al revés al recargar). Es el mismo comportamiento que ya tenía entre dos dispositivos.
- **Borrar una materia no borra sus clases ni sus proyectos**, igual que la app anterior: las clases conservan el id de la materia en `subject` (el Horario las muestra como clases sueltas y se siguen editando) y los proyectos su nombre. Borrar un cuaderno sí borra sus cajitas.
- **Renombrar una materia** en la app nueva actualiza también el `subject` de los proyectos que tenían su nombre anterior (la app anterior no lo hacía y el vínculo se rompía). El formato no cambia: sigue siendo el nombre.
- **Lenguaje de las cajitas de código**: la app anterior mostraba el selector pero no guardaba el cambio (`updateBox` solo persistía `title`, `text` y `color`). La app nueva lo guarda en el **mismo campo `lang`** que la app anterior ya escribe al crear la cajita, así que la app anterior lo lee sin cambios.
- **Imágenes de los apuntes**: si el texto de una cajita tiene `coreimg:<id>`, la app nueva muestra las imágenes que la app anterior subió a la nube (`POST /api/images/fetch`) y las incrustadas en base64; las que solo están en el IndexedDB del navegador donde se añadieron se indican con un aviso. Subir imágenes a las cajitas aún no está en la app nueva (en **Notas** sí).
- Horas: `blocks` usa horas decimales y `classes` texto `HH:MM`. Enfoque guarda el día en UTC; Calendario y Horario trabajan con la hora local, igual que la app anterior.
- **Días en UTC o en hora local**, igual que la app anterior: Finanzas, Ejercicio, Sueño, Diario, Rutina (comidas y agua) y el «hecho hoy» de Mascotas usan el día en UTC; Ciclo usa el día local.
- **Borrar una mascota borra sus cuidados** (`petCares`), y un cuidado no se puede crear para una mascota que no existe.
- **Notas**: `date` sigue siendo el texto corto de la app anterior («25 sept») y no se reescribe al editar. Las imágenes se reducen a JPEG (máximo 1400 px, calidad 0,72), se suben con `POST /api/images` y se insertan como `![imagen](coreimg:<id>)`, igual que la app anterior con la nube activa; al mostrarlas se piden con `POST /api/images/fetch`. Las imágenes incrustadas en base64 (`data:image/…`) también se muestran. Compartir (`shareId`) no se reconstruye porque en la app anterior solo funcionaba en el mismo navegador; el campo se conserva tal cual.
- **Trabajo** y **Respiración** guardan en los formatos de la app anterior: los proyectos de Trabajo son los tres fijos `p1`, `p2` y `p3` (no están unidos a la sección Proyectos) y cada sesión de respiración es `{ id, date, minutes, kind: "respiracion" }` con el día en UTC.
- **Ciclo** se muestra en el menú y en el Calendario solo si la persona lo activa. El ajuste es la columna `showCycle` de la cuenta (la misma que la app anterior lee de `user.showCycle`), no una clave del documento; se cambia con `PATCH /api/v2/me`. Desde **Más** se llega siempre.

## En la web

- Una sola consulta (`useLegacyData`, clave `['legacy']`) alimenta todas las herramientas y **Más**. En la barra lateral y en **Más** se agrupan en «Organización», «Estudio y trabajo» (con Trabajo), «Conocimiento» (Notas, Bóveda y Asistente), «Vida personal» y «Salud» (con Respiración).
- Los cambios se ven al instante y se envían en orden (una cola por documento); si la API falla, se deshacen y aparece un aviso.
- Enfoque: 25 / 5 / 15 minutos; tras cada cuarta sesión de enfoque completada toca descanso largo. Se guarda un registro al terminar o al saltar (si pasó al menos 1 s); reiniciar no guarda. El temporizador vive en la página: si sales de ella, se detiene.
- Borrar materias, proyectos, roadmaps, cuadernos y videos pide confirmación, como la app anterior. Borrar una idea se puede deshacer desde el aviso.
- El texto de las cajitas y el desarrollo y las etiquetas de las ideas se guardan solos mientras escribes (con una espera corta, al salir del campo y al ocultar la página), como en la app anterior.
- Proyectos: el progreso es hitos hechos / total; sin hitos, 100 % entregado, 90 % en revisión y 0 % en curso. «Entregas esta semana» cuenta las fechas entre ayer y dentro de 7 días; una fecha que no se entiende cuenta siempre, como antes. Mejora: «20 SEP», «3 oct.» o «3 de octubre» se leen en español del año en curso (la app anterior se las pasaba a `Date.parse`, que en Chrome las toma como del año 2001 y nunca contaban). El dato guardado no cambia.
- Roadmaps: el estado de cada paso no se guarda; se calcula como en la app anterior (el primero sin hacer es el actual y solo ese se puede completar; los hechos se pueden reabrir).
- Contenido: publicar y despublicar alterna entre `publicado` y `guion`, como la app anterior; además, al editar se puede elegir cualquier etapa (`grabar` y `editar` antes solo las ponía el Asistente).
- En la barra lateral, **Vida personal** (Finanzas, Metas, Mascotas) y **Salud** (Ejercicio, Sueño, Diario, Rutina y, si está activado, Ciclo) se suman a los grupos anteriores. Los grupos se pliegan; por defecto solo está abierto el de la página actual y el navegador recuerda cuáles abriste.
- Estos módulos **no cambian las puntuaciones de los pilares**: Ejercicio, Sueño, Diario y Rutina enlazan al check-in diario, que es lo que las calcula.
- Finanzas: resumen del mes (ingresos, gastos y balance), gastos por categoría y presupuesto del mes. Los montos aceptan coma o punto decimal. Borrar un movimiento se puede deshacer; además, a diferencia de la app anterior, se pueden editar.
- Metas: ±1 y «Lograda»; llegar al objetivo la marca como lograda, como antes.
- Ciclo: «Día N» del ciclo, próximo periodo y ventana fértil con el cálculo de la app anterior (el último inicio es el primer día de la última racha registrada; el próximo, ese día + `cycleLength`, avanzado hasta no quedar en el pasado; la ventana fértil, de 17 a 13 días antes). Se presenta siempre como **estimación, no consejo médico**. El Calendario usa **el mismo cálculo** (la app anterior usaba otro distinto allí) para marcar la regla registrada y la prevista. «Recordarme el próximo periodo» crea un evento del Calendario con el color `#EC6A9C` de la paleta de eventos (el `#E5487D` que intentaba la app anterior no está en esa paleta).
- Diario: una entrada por día. La app anterior la creaba al abrir la sección; la app nueva la crea con lo primero que escribes o eliges, y después guarda sola mientras escribes.
- Ejercicio: «Agendar» crea en Rutina `🏋️ Entreno: <plan>` a las 18:00 todos los días, como la app anterior.
- Los **avisos con sonido** de Mascotas y Rutina (notificaciones a la hora) aún no están en la app nueva: se guardan y se editan `time`, `days`, `sound` y `enabled`, y la web muestra cuándo toca cada uno.
- Notas: biblioteca por materia con búsqueda y filtro por etiqueta; editor con barra de formato (negrita, cursiva, encabezado, lista, casilla, código y cita), vista previa y guardado automático. La vista previa usa un **Markdown seguro** propio: nunca inserta HTML, solo enlaza `http(s)` y `mailto`, las imágenes de otras webs se muestran como enlace y las fórmulas `$…$` se ven como texto en monoespaciado (sin KaTeX).
- Respiración: técnicas Caja 4-4-4-4 y 4-7-8 de 1, 3 o 5 minutos, con el texto «Inhala», «Mantén» y «Exhala» (también para lectores de pantalla) y animación que respeta «reducir movimiento». Se guarda al terminar; si terminas antes, se guardan los minutos completos (con menos de uno no se guarda nada).
- Las funciones con IA dentro de otras secciones de la app anterior (resumir, ampliar, generar guion o apuntes, desarrollar ideas) no están en la app nueva; siguen en la app anterior.

### Asistente

- Usa **la clave de Gemini de cada persona**, guardada solo en el `localStorage` de ese navegador (clave `dyc.assistant`, con el modelo elegido). No se guarda en la cuenta ni pasa por nuestro servidor; «Quitar» la borra. La app anterior usaba `core_openai_*`; no se lee ni se borra.
- Las peticiones van **directamente del navegador a Google**: `POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` con `Authorization: Bearer <clave>`. No hay proxy (`ai.php` no se reconstruye). Modelos: `gemini-flash-latest` (por defecto), `gemini-3.6-flash`, `gemini-flash-lite-latest` y `gemini-pro-latest`. «Probar conexión» hace una petición mínima sin datos.
- Errores en español para 401/403 (y 400 de clave no válida), 404 (modelo), 429 (cuota) y 5xx. Ante 429 o 5xx se reintenta **una vez** con `gemini-flash-lite-latest`.
- Antes de usarlo se muestra qué se envía. Siempre: lo que escribes, la conversación, la fecha y la lista de herramientas. **Solo con «Incluir un resumen de mis datos» activado** (empieza desactivado y no se recuerda): un resumen compacto de pendientes y tareas sin hacer, rutina de hoy, metas en curso, totales de finanzas del mes, agua, última noche de sueño, entrenos de la semana, si ya hay diario de hoy y el panel v2 (puntuaciones, check-ins y hábitos de hoy). La página enseña el texto exacto. Nunca se envían la Bóveda, las notas, el texto del diario ni contraseñas.
- La conversación solo vive en memoria: se pierde al recargar o salir. Las respuestas usan el mismo Markdown seguro que las notas.
- Herramientas: `add_todo`, `add_task`, `add_idea`, `add_goal`, `add_transaction`, `log_water`, `log_workout`, `log_sleep`, `add_journal` y `add_routine`, con los parámetros de la app anterior (`log_workout` pide además los minutos, porque `workouts` exige al menos 1). Cada llamada se muestra como **acción propuesta** con lo que se va a guardar y los botones «Hacer» y «Descartar»; **nada se escribe sin «Hacer»**, y entonces se guarda con esta misma API de módulos (validada antes con los esquemas de `@dyc/core`). El resultado de cada acción se envía al modelo con el siguiente mensaje. `add_journal` añade a la entrada de hoy si ya existe (una por día).
- No hay Content-Security-Policy en la web ni en su `.htaccess`; si se añade, `connect-src` debe permitir `https://generativelanguage.googleapis.com`.

## En el móvil

La app móvil tiene una pestaña **Más** con el mismo catálogo que la web (`TOOL_CATALOG` en `@dyc/core`: grupos, textos y cuentas). Tienen pantalla nativa 22 de las 24 (tandas 1 a 4): **Agenda** (`/agenda`, con `?vista=tareas`), **Pendientes**, **Calendario**, **Horario**, **Enfoque**, **Materias**, **Proyectos**, **Roadmaps**, **Cuadernos** (`/cuadernos` y `/cuadernos/:id`), **Contenido**, **Ideas**, **Trabajo**, **Notas** (`/notas` y `/notas/:id`), **Finanzas**, **Metas**, **Mascotas**, **Ciclo**, **Ejercicio**, **Sueño** (`/sueno`), **Diario**, **Rutina** y **Respiración** (`/respiracion`). **Bóveda** y **Asistente** se quedan en la web a propósito: se muestran como «En la web», la fila dice por qué y se abren en el navegador (`EXPO_PUBLIC_WEB_URL`).

- Una sola consulta (`['legacy']`, `GET /api/v2/modules`) y los mismos cambios elemento a elemento, en cola y optimistas: el cálculo del cambio en la copia local (`applyLegacyOp`) está en `@dyc/core` y lo comparten la web y el móvil. Si la API falla, se deshace y aparece un aviso.
- Mismos formatos: horas decimales en `blocks`, `HH:MM` en `classes` (se acepta «8:30» u «0830» y se guarda «08:30»), `reminders.day` como día del mes, día local en Calendario y Horario y día UTC en Enfoque (lo más reciente primero, máximo 500).
- Sin selectores nativos (no se añaden dependencias): las horas de los bloques y el día del mes de los eventos se eligen con botones de menos y más en pasos de media hora o de un día.
- Enfoque: el temporizador vive en la pantalla, como en la web; si la app pasa a segundo plano, al volver termina la sesión si ya se cumplió el tiempo.
- Los ids nuevos usan `crypto.randomUUID` si existe y, si no (React Native), `id_` + texto aleatorio y la fecha, como la app anterior.
- Tanda 2 con los mismos formatos y reglas que la web (las utilidades puras están en `@dyc/core`): temas, hitos y pasos se guardan como la lista completa con un PATCH de su elemento (solo `id`, `name`, `done` y `date`; el servidor conserva lo demás por id) y sus ids son `randomUUID` o `x` + 7 caracteres; borrar una materia conserva sus clases y proyectos y renombrarla actualiza los proyectos que la nombran; la entrega de un proyecto sigue siendo texto libre («20 SEP»); borrar un cuaderno borra sus cajitas; el lenguaje de las cajitas de código se guarda en `lang`; el texto de las cajitas y el desarrollo y las etiquetas de las ideas se guardan solos (con una espera corta, al salir del campo y al pasar la app a segundo plano). Borrar materias, proyectos, roadmaps, cuadernos y videos pide confirmación; borrar una idea se deshace desde el aviso.
- Tanda 3 con los mismos formatos y reglas que la web (utilidades puras en `@dyc/core`: `parseAmount`, `goalDeadlineLabel`, `careWhen`, `periodReminder`, `workoutRoutine`, `journalStats`, `toggleWeekday`…): día UTC en Finanzas, Ejercicio, Sueño, Diario, Rutina (comidas y agua) y el «hecho hoy» de Mascotas; día local en Metas, Ciclo y Calendario. `budget`, `cycle` y `dayLog` son objetos y se cambian con `PATCH /api/v2/modules/:key` (quitar el presupuesto guarda `monthly: 0`; el agua de otro día cuenta como 0 y el primer vaso guarda `{dateKey, water}`). Borrar una mascota borra sus cuidados. En Diario la entrada del día se crea con lo primero que escribes o eliges (la web la crea al abrir la sección) y se guarda sola. Ciclo sigue siendo opcional: el interruptor cambia `showCycle` de la cuenta (`PATCH /api/v2/me`, el mismo ajuste que la web) y, con él activado, el Calendario marca la regla registrada y la prevista y enlaza a Ciclo en la app. Borrar movimientos, entrenos, noches y entradas del diario se deshace desde el aviso; borrar metas, mascotas, cuidados, rutinas y comidas pide confirmación.
- Fechas y horas sin selectores nativos: las fechas se mueven con botones de día anterior y siguiente (y un mes antes o después donde hace falta) y las horas se escriben (`HH:MM`, se acepta «830» y se guarda «08:30»). En Ciclo, mantener pulsado un día lo marca o quita como día de regla (en la web es doble clic); las duraciones del ciclo se ajustan con botones de menos y más. El presupuesto que la web aún guardaba solo en el navegador no se propone en el móvil.
- Adaptado al teléfono: los formularios son hojas inferiores, los selectores de la web son fichas (materia, estado, plataforma, etapa, categoría, lenguaje, icono) y las listas de sugerencias de Cuadernos (categoría, materia y tema) son fichas bajo el campo. El color de una cajita y su lenguaje se eligen en una hoja.
- Imágenes de las cajitas: se muestran las `coreimg:` que están en la nube (`POST /api/images/fetch`) y las incrustadas en base64, y se avisa de las que solo están en el navegador donde se añadieron. Subir imágenes no está en el móvil.
- «Copiar» una cajita: en el teléfono abre la hoja de compartir del sistema (que incluye «Copiar»), porque React Native ya no trae portapapeles y no se añaden dependencias; en la vista web copia al portapapeles.
- Tanda 4 con los mismos formatos que la web (utilidades puras en `@dyc/core`: `parseBlocks`, `parseInline`, `markdownToText`, `applyFormat`, `filterNotes`, `groupNotesBySubject`, `workBucketOf`, `breathPhase`, `meditationStats`…). **Notas**: biblioteca por materia con búsqueda (sin tildes) y filtro por etiqueta; una nota nueva lleva la etiqueta del filtro y se abre en «Escribir». El editor guarda solo el título y el texto (500 ms), las etiquetas (1 s) y la materia al salir del campo, con los mismos PATCH que la web. La barra de formato (negrita, cursiva, encabezado, lista, casilla, código y cita) usa la selección del campo. La vista previa usa el mismo analizador de Markdown seguro que la web y lo dibuja con `Text` y `View` nativos: nunca se interpreta HTML, solo se abren enlaces http(s) y mailto, las fórmulas se ven como texto y las imágenes `coreimg:` (de la nube) y base64 se muestran; las de otras webs son un enlace. Subir imágenes a una nota no está en el móvil. Borrar una nota pide confirmación. Si un guardado falla, la nota vuelve a lo guardado y lo escrito se queda en el campo para no perderlo. **Trabajo**: los tres proyectos fijos y los grupos En curso, Por hacer y Hecho; borrar pide confirmación. **Respiración**: técnicas Caja 4-4-4-4 y 4-7-8 de 1, 3 o 5 minutos, con el texto «Inhala», «Mantén» y «Exhala» y los segundos de cada fase; cada cambio de fase se anuncia a los lectores de pantalla. El círculo crece y se encoge con cada fase y se queda quieto con «Reducir movimiento» (`AccessibilityInfo`). Guarda `meditations` como la web (día UTC, minutos enteros, `kind: "respiracion"`; con menos de un minuto no se guarda) y borrar una sesión se deshace desde el aviso.
- **Bóveda, solo en la web.** Su formato (`vaultSecure`) necesita Web Crypto: PBKDF2-SHA-256 con 600 000 iteraciones, AES-GCM de 256 bits y un generador aleatorio seguro para la sal y los IV. En el teléfono la app corre en Hermes (Expo SDK 57, React Native 0.86), que no trae `crypto` (ni `crypto.subtle` ni `crypto.getRandomValues`); los polyfills de Expo (`expo/src/winter`) añaden `fetch`, `URL`, `TextDecoder` o `FormData`, pero no criptografía, y `expo-crypto` no está instalado (sería una dependencia nueva). Una versión en JavaScript puro sería más lenta y no tendría un generador aleatorio seguro, así que no se ofrece una Bóveda más débil: se abre en la web. Si algún día se añade un módulo nativo con PBKDF2 y AES-GCM, debe ser compatible byte a byte con `vaultCrypto.ts` de la web (mismos parámetros, IV de 12 bytes y el id de la entrada como dato autenticado).
- **Asistente, solo en la web.** La clave de Gemini solo se guarda en el navegador por diseño, así que en el móvil no se construye: la fila de «Más» lo dice y lo abre en la web.
- Los interruptores de toda la app (herramientas, Hábitos y Perfil) usan el mismo componente, con el pulgar blanco, que se ve bien también en el tema oscuro.

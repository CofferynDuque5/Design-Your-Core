# Módulos de la app anterior en la app nueva

La app anterior ("Core") guarda todo el estado de cada persona en **un solo documento JSON** (tabla `Blob`, rutas v1 `GET/PUT /api/sync`). La app nueva recupera sus secciones por tandas, leyendo y escribiendo **ese mismo documento**, así que la app anterior sigue funcionando y los datos que ya existen aparecen sin migrar nada.

| Tanda | Secciones | Rutas web | Claves del documento |
|---|---|---|---|
| 1 | Agenda, Pendientes, Calendario, Horario, Enfoque | `/agenda` (`?vista=tareas`), `/pendientes`, `/calendario`, `/horario`, `/enfoque` | `blocks`, `tasks`, `todos`, `subtasks`, `reminders`, `classes`, `focus` |
| 2 | Materias, Proyectos, Roadmaps, Cuadernos, Contenido, Ideas | `/materias`, `/proyectos`, `/roadmaps`, `/cuadernos` (y `/cuadernos/:id`), `/contenido`, `/ideas` | `subjects`, `projects`, `roadmaps`, `notebooks`, `noteBoxes`, `content`, `ideas` |
| 3 | Finanzas, Metas, Mascotas, Ciclo, Ejercicio, Sueño, Diario, Rutina | `/finanzas`, `/metas`, `/mascotas`, `/ciclo`, `/ejercicio`, `/sueno`, `/diario`, `/rutina` | `transactions`, `budget`, `goals`, `pets`, `petCares`, `period`, `cycle`, `workouts`, `sleep`, `journal`, `routines`, `meals`, `dayLog` |

El resto de secciones (Notas de la Bodega, Trabajo y Respiración) aparece en **Más** con su número de elementos y un enlace a la app anterior hasta que lleguen. El estudio completo de formatos está en `diagnostico/modulos-app-anterior.md` (carpeta del proyecto).

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

`:key` es una lista: `blocks`, `tasks`, `todos`, `subtasks`, `reminders`, `classes`, `focus`, `subjects`, `projects`, `roadmaps`, `notebooks`, `noteBoxes`, `content`, `ideas`, `transactions`, `goals`, `pets`, `petCares`, `period`, `workouts`, `sleep`, `journal`, `routines` o `meals` (otra clave responde 404, y las rutas de listas con una clave de objeto también). Como hace la app anterior, en `focus` (500), `transactions` (2000), `workouts` (400) y `sleep` (400) el elemento nuevo va **al principio** y la lista se corta en ese máximo; en las demás va al final. `period` y `journal` admiten **un solo registro por fecha**: repetir la fecha responde 409.

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

`days` es el texto de la app anterior con los días en que toca: `"1234567"`, con **1 = lunes** y 7 = domingo, cada día una sola vez y al menos uno.

| Objeto | Campos |
|---|---|
| `cycle` | `cycleLength` 15–60 (por defecto 28), `periodLength` 1–14 (por defecto 5) |
| `dayLog` | `dateKey` (UTC), `water` 0–40, `waterGoal` 1–40 (por defecto 8). Si `dateKey` no es hoy, el agua de hoy cuenta desde 0 y la meta se conserva |
| `budget` | `monthly` ≥ 0. **Clave nueva**: la app anterior guardaba el presupuesto solo en el `localStorage` del navegador (`core_budget`); la app nueva lo guarda en el documento y, si aún no hay, ofrece ese valor del navegador como sugerencia al definirlo. `monthly: 0` = sin presupuesto |

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
- **Imágenes de los apuntes**: si el texto de una cajita tiene `coreimg:<id>`, la app nueva muestra las imágenes que la app anterior subió a la nube (`POST /api/images/fetch`) y las incrustadas en base64; las que solo están en el IndexedDB del navegador donde se añadieron se indican con un aviso. Subir imágenes aún no está en la app nueva.
- Horas: `blocks` usa horas decimales y `classes` texto `HH:MM`. Enfoque guarda el día en UTC; Calendario y Horario trabajan con la hora local, igual que la app anterior.
- **Días en UTC o en hora local**, igual que la app anterior: Finanzas, Ejercicio, Sueño, Diario, Rutina (comidas y agua) y el «hecho hoy» de Mascotas usan el día en UTC; Ciclo usa el día local.
- **Borrar una mascota borra sus cuidados** (`petCares`), y un cuidado no se puede crear para una mascota que no existe.
- **Ciclo** se muestra en el menú y en el Calendario solo si la persona lo activa. El ajuste es la columna `showCycle` de la cuenta (la misma que la app anterior lee de `user.showCycle`), no una clave del documento; se cambia con `PATCH /api/v2/me`. Desde **Más** se llega siempre.

## En la web

- Una sola consulta (`useLegacyData`, clave `['legacy']`) alimenta todas las herramientas y **Más**. En la barra lateral y en **Más** se agrupan en «Organización» (tanda 1), «Estudio y trabajo» (tanda 2), «Vida personal» y «Salud» (tanda 3).
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
- Las funciones con IA de la app anterior (resumir, ampliar, generar guion o apuntes, desarrollar ideas) no están en la app nueva; siguen en la app anterior.

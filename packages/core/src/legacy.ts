import { z } from 'zod';
import { addDays, isDay, type Day } from './dates.js';

/**
 * Módulos de la app anterior ("Core"). Sus datos viven en el documento JSON de
 * /api/sync (un objeto por persona). Estos esquemas reproducen exactamente los
 * formatos que escribe la app anterior para que ambas apps puedan convivir.
 * Ver docs/modulos.md.
 */

/** Claves del documento que la API v2 permite editar por elemento (tandas 1 y 2). */
export const LEGACY_KEYS = [
  'blocks',
  'tasks',
  'todos',
  'subtasks',
  'reminders',
  'classes',
  'focus',
  'subjects',
  'projects',
  'roadmaps',
  'notebooks',
  'noteBoxes',
  'content',
  'ideas',
] as const;
export type LegacyKey = (typeof LEGACY_KEYS)[number];
export const isLegacyKey = (k: unknown): k is LegacyKey => typeof k === 'string' && (LEGACY_KEYS as readonly string[]).includes(k);

// ---------- Catálogos (mismos valores y colores que la app anterior) ----------

export const BLOCK_KINDS = ['ex', 'study', 'class', 'project', 'break', 'read'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const BLOCK_KIND_INFO: Record<BlockKind, { label: string; color: string }> = {
  ex: { label: 'Ejercicio', color: '#0FA968' },
  study: { label: 'Estudio', color: '#8B5CF6' },
  class: { label: 'Clase', color: '#4F7CFF' },
  project: { label: 'Proyecto', color: '#EC6A9C' },
  break: { label: 'Descanso', color: '#98A0AA' },
  read: { label: 'Lectura', color: '#E8A13A' },
};

export const TASK_PRIORITIES = ['alta', 'media', 'baja'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_INFO: Record<TaskPriority, { label: string; color: string }> = {
  alta: { label: 'Alta', color: '#E5484D' },
  media: { label: 'Media', color: '#E8912A' },
  baja: { label: 'Baja', color: '#8A8F98' },
};

/** Colores que la API anterior acepta para un evento (el primero es el de por defecto). */
export const REMINDER_COLORS = ['#0FA968', '#4F7CFF', '#EC6A9C', '#8B5CF6', '#E8912A', '#E5484D'] as const;
/** Paleta de clases del Horario (el primero es el de por defecto). */
export const CLASS_COLORS = ['#4F7CFF', '#0FA968', '#8B5CF6', '#EC6A9C', '#E8912A', '#22B8CF', '#E5484D'] as const;
/** Paletas de la tanda 2 (el primer color es el de por defecto, salvo en proyectos, que empiezan por el de la materia). */
export const SUBJECT_COLORS = ['#4F7CFF', '#0FA968', '#E8912A', '#8B5CF6', '#EC6A9C', '#22B8CF'] as const;
export const PROJECT_COLORS = ['#0FA968', '#4F7CFF', '#E8912A', '#EC6A9C', '#8B5CF6', '#EF4444', '#14B8A6'] as const;
export const ROADMAP_COLORS = ['#8B5CF6', '#4F7CFF', '#0FA968', '#E8912A', '#EC6A9C'] as const;
export const NOTEBOOK_COLORS = ['#4F7CFF', '#0FA968', '#EC6A9C', '#8B5CF6', '#E8912A', '#E5484D', '#14B8A6', '#111827'] as const;
/** Fondos de las cajitas de texto; las de código usan siempre CODE_BOX_COLOR. */
export const BOX_COLORS = ['#FFF7D6', '#DDF3E4', '#E3ECFF', '#FCE0EC', '#EDE4FF', '#FFE8D6', '#F1F3F5'] as const;
export const CODE_BOX_COLOR = '#1e1e2e';
export const NOTEBOOK_EMOJIS = ['📓', '📕', '📗', '📘', '📙', '🧠', '🔬', '🧮', '📐', '🌍', '💻', '🎨', '🎵', '⚗️', '📖', '✏️'] as const;
/** Lenguajes de las cajitas de código (el primero es el de por defecto). */
export const CODE_LANGS = ['js', 'ts', 'python', 'html', 'css', 'java', 'c++', 'c#', 'php', 'sql', 'bash', 'json', 'otro'] as const;

export const COLOR_NAMES: Record<string, string> = {
  '#0FA968': 'Verde',
  '#4F7CFF': 'Azul',
  '#EC6A9C': 'Rosa',
  '#8B5CF6': 'Violeta',
  '#E8912A': 'Naranja',
  '#E5484D': 'Rojo',
  '#22B8CF': 'Turquesa',
  '#EF4444': 'Rojo',
  '#14B8A6': 'Verde azulado',
  '#111827': 'Negro',
  '#FFF7D6': 'Amarillo',
  '#DDF3E4': 'Verde',
  '#E3ECFF': 'Azul',
  '#FCE0EC': 'Rosa',
  '#EDE4FF': 'Lila',
  '#FFE8D6': 'Melocotón',
  '#F1F3F5': 'Gris',
};

export const PROJECT_STATUSES = ['curso', 'revision', 'entregado'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_INFO: Record<ProjectStatus, { label: string }> = {
  curso: { label: 'En curso' },
  revision: { label: 'En revisión' },
  entregado: { label: 'Entregado' },
};

export const CONTENT_STAGES = ['idea', 'guion', 'grabar', 'editar', 'publicado'] as const;
export type ContentStage = (typeof CONTENT_STAGES)[number];
export const CONTENT_STAGE_INFO: Record<ContentStage, { label: string }> = {
  idea: { label: 'Idea' },
  guion: { label: 'Guion' },
  grabar: { label: 'Grabar' },
  editar: { label: 'Editar' },
  publicado: { label: 'Publicado' },
};

export const CONTENT_PLATFORMS = ['youtube', 'tiktok', 'instagram', 'otro'] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];
export const CONTENT_PLATFORM_INFO: Record<ContentPlatform, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: '#FF0033' },
  tiktok: { label: 'TikTok', color: '#111827' },
  instagram: { label: 'Instagram', color: '#E1306C' },
  otro: { label: 'Otro', color: '#8B8E88' },
};

export const IDEA_CATEGORIES = ['app', 'web', 'marketing', 'otro'] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
export const IDEA_CATEGORY_INFO: Record<IdeaCategory, { label: string; color: string }> = {
  app: { label: 'App', color: '#0FA968' },
  web: { label: 'Web', color: '#4F7CFF' },
  marketing: { label: 'Marketing', color: '#EC6A9C' },
  otro: { label: 'Otro', color: '#8A8F98' },
};

/** Días de la semana de las clases: 1 = lunes … 7 = domingo. */
export const CLASS_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

export const FOCUS_MODES = ['focus', 'short', 'long'] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];
export const FOCUS_MODE_INFO: Record<FocusMode, { label: string; minutes: number }> = {
  focus: { label: 'Enfoque', minutes: 25 },
  short: { label: 'Descanso corto', minutes: 5 },
  long: { label: 'Descanso largo', minutes: 15 },
};
/** La app anterior guarda como máximo 500 sesiones, la más reciente primero. */
export const FOCUS_MAX = 500;

// ---------- Formas de los elementos ----------

export interface LegacyBlock {
  id: string;
  label: string;
  sub: string;
  /** Hora de inicio en horas decimales (8.5 = 8:30). */
  start: number;
  /** Duración en horas. */
  dur: number;
  kind: BlockKind;
}

export interface LegacyTask {
  id: string;
  title: string;
  pri: TaskPriority;
  time: string | null;
  rem: boolean;
  done: boolean;
  tags: string;
}

export interface LegacyTodo {
  id: string;
  title: string;
  done: boolean;
}

export interface LegacySubtask {
  id: string;
  todoId: string;
  title: string;
  done: boolean;
}

export interface LegacyReminder {
  id: string;
  /** Día del mes (1–31): el evento se repite cada mes. */
  day: number;
  title: string;
  when: string;
  color: string;
  icon: string;
  on: boolean;
}

export interface LegacyClass {
  id: string;
  /** 1 = lunes … 7 = domingo. */
  day: number;
  start: string;
  end: string;
  title: string;
  room: string;
  color: string;
  /** Id de la materia (`subjects`) o "". */
  subject: string;
}

export interface LegacyFocus {
  id: string;
  mode: FocusMode;
  seconds: number;
  /** Día en UTC, como la app anterior. */
  dateKey: Day;
}

/** Tema de una materia, hito de un proyecto o paso de un roadmap (van dentro de su elemento). */
export interface LegacyCheckItem {
  id: string;
  name: string;
  done: boolean;
}

export interface LegacySubject {
  id: string;
  name: string;
  teacher: string;
  room: string;
  color: string;
  /** Texto libre, p. ej. "Lunes 8:00". */
  nextClass: string;
  topics: LegacyCheckItem[];
}

export interface LegacyMilestone extends LegacyCheckItem {
  /** Siempre "" en la app anterior. */
  date: string;
}

export interface LegacyProject {
  id: string;
  title: string;
  /** NOMBRE de la materia (no su id) o "". */
  subject: string;
  /** Texto libre, p. ej. "20 SEP". */
  deadline: string;
  status: ProjectStatus;
  color: string;
  milestones: LegacyMilestone[];
}

export interface LegacyRoadmap {
  id: string;
  name: string;
  color: string;
  steps: LegacyCheckItem[];
}

export interface LegacyNotebook {
  id: string;
  title: string;
  category: string;
  /** Texto libre (no es un vínculo con `subjects`). */
  subject: string;
  topic: string;
  color: string;
  emoji: string;
}

export interface LegacyNoteBox {
  id: string;
  notebookId: string;
  title: string;
  text: string;
  color: string;
  kind: 'text' | 'code';
  /** "" en las de texto; en las de código, uno de CODE_LANGS. */
  lang: string;
}

export interface LegacyContent {
  id: string;
  title: string;
  stage: ContentStage;
  platform: ContentPlatform;
  notes: string;
  script: string;
  /** Texto libre, p. ej. "12 sep". */
  due: string;
}

export interface LegacyIdea {
  id: string;
  title: string;
  body: string;
  category: IdeaCategory;
  /** Etiquetas separadas por comas. */
  tags: string;
}

export interface LegacyItems {
  blocks: LegacyBlock;
  tasks: LegacyTask;
  todos: LegacyTodo;
  subtasks: LegacySubtask;
  reminders: LegacyReminder;
  classes: LegacyClass;
  focus: LegacyFocus;
  subjects: LegacySubject;
  projects: LegacyProject;
  roadmaps: LegacyRoadmap;
  notebooks: LegacyNotebook;
  noteBoxes: LegacyNoteBox;
  content: LegacyContent;
  ideas: LegacyIdea;
}

/** Documento completo de la app anterior: claves conocidas y cualquier otra que traiga. */
export type LegacyData = Record<string, unknown> & { [K in LegacyKey]?: Array<LegacyItems[K]> };

// ---------- Validación ----------

/** Ids nuevos con crypto.randomUUID(); se aceptan también los antiguos (id_…, x…). */
export const legacyIdSchema = z.string().regex(/^[\w-]{1,100}$/, 'Id no válido');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (usa HH:MM)');
const title = (max: number) => z.string().trim().min(1, 'Escribe un título').max(max);
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color no válido');
const text = (max: number) => z.string().max(max).default('');
const line = (max: number) => z.string().trim().max(max).default('');

/**
 * Subelementos (temas, hitos, pasos). Se editan enviando la lista completa
 * dentro del PATCH del elemento. El nombre no se recorta ni se exige para no
 * rechazar datos antiguos al reenviarlos; la interfaz no deja crear vacíos.
 */
const checkItem = z.object({ id: legacyIdSchema, name: z.string().max(300), done: z.boolean().default(false) }).strict();
const checkList = (item: z.AnyZodObject = checkItem) => z.array(item).max(1000).default([]);

const shapes = {
  blocks: z.object({
    id: legacyIdSchema,
    label: title(120),
    sub: z.string().trim().max(200).default(''),
    start: z.number().min(0).max(23.5),
    dur: z.number().gt(0).max(24),
    kind: z.enum(BLOCK_KINDS).default('study'),
  }),
  tasks: z.object({
    id: legacyIdSchema,
    title: title(200),
    pri: z.enum(TASK_PRIORITIES).default('media'),
    time: hhmm.nullable().default(null),
    rem: z.boolean().default(false),
    done: z.boolean().default(false),
    tags: z.string().max(200).default(''),
  }),
  todos: z.object({ id: legacyIdSchema, title: title(300), done: z.boolean().default(false) }),
  subtasks: z.object({ id: legacyIdSchema, todoId: legacyIdSchema, title: title(300), done: z.boolean().default(false) }),
  reminders: z.object({
    id: legacyIdSchema,
    day: z.number().int().min(1).max(31),
    title: title(200),
    when: z.string().trim().max(60).default(''),
    color: z.enum(REMINDER_COLORS).default(REMINDER_COLORS[0]),
    icon: z.string().max(40).default('doc'),
    on: z.boolean().default(true),
  }),
  classes: z.object({
    id: legacyIdSchema,
    day: z.number().int().min(1).max(7),
    start: hhmm,
    end: hhmm,
    title: title(120),
    room: z.string().trim().max(60).default(''),
    // La paleta del Horario, o el color copiado de una materia.
    color: hex.default(CLASS_COLORS[0]),
    subject: z.union([legacyIdSchema, z.literal('')]).default(''),
  }),
  focus: z.object({
    id: legacyIdSchema,
    mode: z.enum(FOCUS_MODES),
    seconds: z.number().int().min(1).max(86_400),
    dateKey: z.string().refine(isDay, 'Fecha no válida (usa AAAA-MM-DD)'),
  }),
  subjects: z.object({
    id: legacyIdSchema,
    name: title(120),
    teacher: line(120),
    room: line(60),
    color: hex.default(SUBJECT_COLORS[0]),
    nextClass: line(60),
    topics: checkList(),
  }),
  projects: z.object({
    id: legacyIdSchema,
    title: title(200),
    subject: line(120),
    deadline: line(60),
    status: z.enum(PROJECT_STATUSES).default('curso'),
    color: hex.default(PROJECT_COLORS[0]),
    milestones: checkList(checkItem.extend({ date: z.string().max(60).default('') })),
  }),
  roadmaps: z.object({
    id: legacyIdSchema,
    name: title(120),
    color: hex.default(ROADMAP_COLORS[0]),
    steps: checkList(),
  }),
  notebooks: z.object({
    id: legacyIdSchema,
    title: title(120).default('Cuaderno'),
    category: z.string().trim().max(60).default('General').transform((c) => c || 'General'),
    subject: line(120),
    topic: line(120),
    color: hex.default(NOTEBOOK_COLORS[0]),
    emoji: z.string().min(1).max(16).default(NOTEBOOK_EMOJIS[0]),
  }),
  noteBoxes: z.object({
    id: legacyIdSchema,
    notebookId: legacyIdSchema,
    title: z.string().max(200).default(''),
    text: text(200_000),
    color: hex.optional(),
    kind: z.enum(['text', 'code']).default('text'),
    lang: z.string().max(20).optional(),
  }),
  content: z.object({
    id: legacyIdSchema,
    title: title(200),
    stage: z.enum(CONTENT_STAGES).default('idea'),
    platform: z.enum(CONTENT_PLATFORMS).default('youtube'),
    notes: text(50_000),
    script: text(50_000),
    due: line(60),
  }),
  ideas: z.object({
    id: legacyIdSchema,
    title: title(200),
    body: text(50_000),
    category: z.enum(IDEA_CATEGORIES).default('app'),
    tags: z.string().max(300).default(''),
  }),
};

/**
 * Reglas entre campos. Se comprueban sobre el elemento ya fusionado, y en un
 * PATCH solo si el cambio toca alguno de `fields` (así un dato antiguo raro no
 * impide, por ejemplo, marcar algo como hecho).
 */
export const LEGACY_CROSS: Partial<Record<LegacyKey, { fields: string[]; check: (item: Record<string, unknown>) => string | null }>> = {
  blocks: {
    fields: ['start', 'dur'],
    check: (b) => (typeof b.start === 'number' && typeof b.dur === 'number' && b.start + b.dur > 24 ? 'El bloque no puede pasar de medianoche' : null),
  },
  classes: {
    fields: ['start', 'end'],
    check: (c) => (typeof c.start === 'string' && typeof c.end === 'string' && c.end > c.start ? null : 'La hora de fin debe ser posterior a la de inicio'),
  },
};

const withCross = <T extends z.ZodTypeAny>(key: LegacyKey, schema: T) => {
  const cross = LEGACY_CROSS[key];
  return cross
    ? schema.superRefine((v, ctx) => {
        const msg = cross.check(v as Record<string, unknown>);
        if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [cross.fields[1] ?? cross.fields[0]] });
      })
    : schema;
};

/** Elemento nuevo (POST): campos exactos, sin extras. Rellena los valores por defecto de la app anterior. */
export const legacyItemSchemas = {
  blocks: withCross('blocks', shapes.blocks.strict()),
  tasks: shapes.tasks.strict().transform((t) => ({ ...t, rem: !!t.time })),
  todos: shapes.todos.strict(),
  subtasks: shapes.subtasks.strict(),
  reminders: shapes.reminders.strict(),
  classes: withCross('classes', shapes.classes.strict()),
  focus: shapes.focus.strict(),
  subjects: shapes.subjects.strict(),
  projects: shapes.projects.strict(),
  roadmaps: shapes.roadmaps.strict(),
  notebooks: shapes.notebooks.strict(),
  // Color y lenguaje por defecto según el tipo, y en el mismo orden que la app anterior.
  noteBoxes: shapes.noteBoxes.strict().transform((b) => ({
    id: b.id,
    notebookId: b.notebookId,
    title: b.title,
    text: b.text,
    color: b.color ?? (b.kind === 'code' ? CODE_BOX_COLOR : BOX_COLORS[0]),
    kind: b.kind,
    lang: b.lang ?? (b.kind === 'code' ? CODE_LANGS[0] : ''),
  })),
  content: shapes.content.strict(),
  ideas: shapes.ideas.strict(),
} satisfies Record<LegacyKey, z.ZodTypeAny>;

const patchOf = (o: z.AnyZodObject): z.AnyZodObject => {
  // Sin valores por defecto: un PATCH solo cambia lo que trae.
  const entries = Object.entries(o.shape as Record<string, z.ZodTypeAny>).filter(([k]) => k !== 'id');
  return z.object(Object.fromEntries(entries.map(([k, v]) => [k, (v instanceof z.ZodDefault ? v.removeDefault() : v).optional()]))).strict();
};

/** Cambios parciales (PATCH). El id no se puede cambiar. */
export const legacyPatchSchemas = {
  blocks: patchOf(shapes.blocks),
  tasks: patchOf(shapes.tasks),
  todos: patchOf(shapes.todos),
  subtasks: patchOf(shapes.subtasks),
  reminders: patchOf(shapes.reminders),
  classes: patchOf(shapes.classes),
  focus: patchOf(shapes.focus),
  subjects: patchOf(shapes.subjects),
  projects: patchOf(shapes.projects),
  roadmaps: patchOf(shapes.roadmaps),
  notebooks: patchOf(shapes.notebooks),
  noteBoxes: patchOf(shapes.noteBoxes),
  content: patchOf(shapes.content),
  ideas: patchOf(shapes.ideas),
} satisfies Record<LegacyKey, z.ZodTypeAny>;

/** Cambios parciales de un elemento (sin id). */
export type LegacyPatch<K extends LegacyKey> = Partial<Omit<LegacyItems[K], 'id'>>;

/** Lista de subelementos de cada clave (se edita con un PATCH del elemento). */
export const LEGACY_NESTED: Partial<Record<LegacyKey, string>> = { subjects: 'topics', projects: 'milestones', roadmaps: 'steps' };

/** Relaciones padre → hijos: el hijo guarda el id del padre en `field` y se borra con él, como en la app anterior. */
export const LEGACY_CHILDREN: Partial<Record<LegacyKey, { key: LegacyKey; field: string }>> = {
  todos: { key: 'subtasks', field: 'todoId' },
  notebooks: { key: 'noteBoxes', field: 'notebookId' },
};

/** Padre de cada clave hija (el inverso de LEGACY_CHILDREN). */
export const LEGACY_PARENT: Partial<Record<LegacyKey, { key: LegacyKey; field: string }>> = {
  subtasks: { key: 'todos', field: 'todoId' },
  noteBoxes: { key: 'notebooks', field: 'notebookId' },
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Aplica un cambio parcial igual en el servidor y en la vista optimista:
 * fusión superficial (se conservan los campos que la app nueva no conoce) y,
 * en las listas anidadas, cada subelemento se fusiona con el guardado de su
 * mismo id para no perder sus campos desconocidos.
 */
export function mergeLegacyItem<T extends { id: string }>(key: LegacyKey, item: T, patch: Record<string, unknown>): T {
  const next: Record<string, unknown> = { ...item, ...patch, id: item.id };
  const field = LEGACY_NESTED[key];
  if (field && Array.isArray(patch[field])) {
    const before = (item as Record<string, unknown>)[field];
    const old = new Map((Array.isArray(before) ? before : []).filter(isObj).map((s) => [s.id, s]));
    next[field] = (patch[field] as unknown[]).map((s) => (isObj(s) ? { ...(old.get(s.id) ?? {}), ...s } : s));
  }
  return next as T;
}

/** Subelementos de un elemento con la defensa de la app anterior: sin entradas rotas, ids y `done` garantizados. */
export function checkItems<T extends LegacyCheckItem>(list: unknown, makeId: () => string): T[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isObj).map((s) => ({ ...s, id: typeof s.id === 'string' && s.id ? s.id : makeId(), name: typeof s.name === 'string' ? s.name : '', done: !!s.done }) as T);
}

/** Para enviar una lista anidada: solo los campos conocidos (el servidor conserva el resto por id). */
export function checkItemsPayload<T extends LegacyCheckItem>(list: T[]): T[] {
  return list.map((s) => ({ id: s.id, name: s.name, done: !!s.done, ...('date' in s ? { date: typeof s.date === 'string' ? s.date : '' } : {}) }) as T);
}

export const legacyReorderSchema = z.object({ ids: z.array(legacyIdSchema).max(5000) }).strict();

/** Lee una lista del documento con la misma defensa que la app anterior (`x || []`). */
export function legacyList<K extends LegacyKey>(data: Record<string, unknown> | null | undefined, key: K): Array<LegacyItems[K]> {
  const v = data?.[key];
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Array<LegacyItems[K]>) : [];
}

/** Reordena como la app anterior: primero los ids indicados, después el resto en su orden. */
export function reorderById<T extends { id: string }>(list: T[], ids: string[]): T[] {
  // Tolera entradas rotas en datos antiguos: se conservan al final.
  const byId = new Map(list.map((x) => [x?.id, x]));
  const used = new Set<T>();
  for (const id of ids) {
    const x = byId.get(id);
    if (x) used.add(x);
  }
  return [...used, ...list.filter((x) => !used.has(x))];
}

// ---------- Enfoque (Pomodoro) ----------

/** Día en UTC, como guarda la app anterior (`toISOString().slice(0,10)`). */
export const utcDayKey = (now: Date = new Date()): Day => now.toISOString().slice(0, 10);

/**
 * Lo que viene después de una sesión. Tras cada cuarta sesión de enfoque
 * completada toca descanso largo; tras las demás, corto; tras un descanso, enfoque.
 */
export function nextFocusMode(mode: FocusMode, completedFocus: number): FocusMode {
  if (mode !== 'focus') return 'focus';
  return completedFocus > 0 && completedFocus % 4 === 0 ? 'long' : 'short';
}

export interface FocusStats {
  sessionsToday: number;
  hoursWeek: number;
  hoursTotal: number;
  streak: number;
}

/** Estadísticas de Enfoque: solo cuentan las sesiones `focus`. `today` es el día UTC. */
export function focusStats(records: LegacyFocus[], today: Day): FocusStats {
  const focus = records.filter((r) => r.mode === 'focus' && typeof r.seconds === 'number');
  const weekStart = addDays(today, -6);
  const days = new Set(focus.map((r) => r.dateKey));
  // La racha cuenta hasta hoy; si hoy aún no hay sesión, hasta ayer.
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  const hours = (list: LegacyFocus[]) => list.reduce((s, r) => s + r.seconds, 0) / 3600;
  return {
    sessionsToday: focus.filter((r) => r.dateKey === today).length,
    hoursWeek: hours(focus.filter((r) => r.dateKey >= weekStart && r.dateKey <= today)),
    hoursTotal: hours(focus),
    streak,
  };
}

// ---------- Horas ----------

/** "08:30" → 8.5 */
export const hhmmToHours = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
};

/** 8.5 → "8:30" (para bloques con horas decimales). */
export function hoursLabel(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ---------- Tanda 2: derivados de Materias, Proyectos y Roadmaps ----------

/** Porcentaje entero de hechos (0 si la lista está vacía). */
export const donePercent = (list: Array<{ done?: unknown }>): number => (list.length ? Math.round((list.filter((x) => !!x.done).length / list.length) * 100) : 0);

/** Progreso de un proyecto como la app anterior: por hitos; sin hitos, 100 % entregado, 90 % en revisión y 0 % en otro caso. */
export function projectProgress(p: { milestones?: unknown; status?: unknown }): number {
  const ms = Array.isArray(p.milestones) ? (p.milestones as Array<{ done?: unknown }>).filter(isObj) : [];
  if (ms.length) return donePercent(ms);
  return p.status === 'entregado' ? 100 : p.status === 'revision' ? 90 : 0;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Lee una fecha de entrega escrita a mano. Entiende "20 SEP", "12 sep.",
 * "3 de octubre (de 2026)" (del año en curso si no lo lleva) y fechas con año
 * que entienda `Date.parse` ("2026-09-28"). Devuelve null si no la entiende.
 */
export function parseDeadline(text: unknown, now: Date = new Date()): Date | null {
  const t = typeof text === 'string' ? text.trim().toLowerCase() : '';
  if (!t) return null;
  const m = /^(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,})\.?(?:\s+(?:de\s+)?(\d{4}))?$/.exec(t);
  if (m) {
    const month = MONTHS_ES.indexOf(m[2].slice(0, 3).replace('set', 'sep'));
    const day = Number(m[1]);
    if (month < 0 || day < 1 || day > 31) return null;
    return new Date(m[3] ? Number(m[3]) : now.getFullYear(), month, day);
  }
  if (!/\d{4}/.test(t)) return null;
  const at = Date.parse(t);
  return Number.isNaN(at) ? null : new Date(at);
}

/**
 * ¿Cuenta como entrega de esta semana? Como la app anterior: entre ayer y
 * dentro de 7 días, y una fecha que no se entiende cuenta siempre (vacía no).
 * Mejora: "20 SEP" se lee en español del año en curso (la app anterior se lo
 * pasaba a `Date.parse`, que en Chrome lo toma como del año 2001).
 */
export function dueThisWeek(deadline: unknown, now: number = Date.now()): boolean {
  const t = typeof deadline === 'string' ? deadline.trim() : '';
  if (!t) return false;
  const at = parseDeadline(t, new Date(now));
  if (!at) return true;
  const day = 86_400_000;
  // Fin del día de la entrega: "hoy" cuenta todo el día.
  const diff = at.getTime() + day - 1 - now;
  return diff >= -day && diff <= 8 * day;
}

export type StepState = 'done' | 'current' | 'next' | 'locked';

/** Estado de cada paso de un roadmap (no se guarda): el primero sin hacer es el actual y el siguiente, el próximo. */
export function stepStates(steps: Array<{ done?: unknown }>): StepState[] {
  const current = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => (s.done ? 'done' : i === current ? 'current' : i === current + 1 ? 'next' : 'locked'));
}

/** "examen, física , " → ["examen", "física"] */
export const splitTags = (tags: unknown): string[] =>
  typeof tags === 'string'
    ? tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

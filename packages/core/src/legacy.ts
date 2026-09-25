import { z } from 'zod';
import { addDays, isDay, type Day } from './dates.js';

/**
 * Módulos de la app anterior ("Core"). Sus datos viven en el documento JSON de
 * /api/sync (un objeto por persona). Estos esquemas reproducen exactamente los
 * formatos que escribe la app anterior para que ambas apps puedan convivir.
 * Ver docs/modulos.md.
 */

/** Claves del documento que la API v2 permite editar por elemento (tanda 1). */
export const LEGACY_KEYS = ['blocks', 'tasks', 'todos', 'subtasks', 'reminders', 'classes', 'focus'] as const;
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
export const COLOR_NAMES: Record<string, string> = {
  '#0FA968': 'Verde',
  '#4F7CFF': 'Azul',
  '#EC6A9C': 'Rosa',
  '#8B5CF6': 'Violeta',
  '#E8912A': 'Naranja',
  '#E5484D': 'Rojo',
  '#22B8CF': 'Turquesa',
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

export interface LegacyItems {
  blocks: LegacyBlock;
  tasks: LegacyTask;
  todos: LegacyTodo;
  subtasks: LegacySubtask;
  reminders: LegacyReminder;
  classes: LegacyClass;
  focus: LegacyFocus;
}

/** Documento completo de la app anterior: claves conocidas y cualquier otra que traiga. */
export type LegacyData = Record<string, unknown> & { [K in LegacyKey]?: Array<LegacyItems[K]> };

// ---------- Validación ----------

/** Ids nuevos con crypto.randomUUID(); se aceptan también los antiguos (id_…, x…). */
export const legacyIdSchema = z.string().regex(/^[\w-]{1,100}$/, 'Id no válido');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (usa HH:MM)');
const title = (max: number) => z.string().trim().min(1, 'Escribe un título').max(max);
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color no válido');

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
} satisfies Record<LegacyKey, z.ZodTypeAny>;

/** Cambios parciales de un elemento (sin id). */
export type LegacyPatch<K extends LegacyKey> = Partial<Omit<LegacyItems[K], 'id'>>;

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

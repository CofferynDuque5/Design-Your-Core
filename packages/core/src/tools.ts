import { addDays, diffDays, isDay, periodRange, type Day } from './dates.js';
import { daysLabel, plural, shortDay } from './format.js';
import {
  BOX_COLORS,
  CARE_KIND_INFO,
  CARE_KINDS,
  CODE_BOX_COLOR,
  CODE_LANGS,
  CONTENT_PLATFORMS,
  CONTENT_STAGES,
  cycleInfo,
  GOAL_CATEGORIES,
  cyclePredictions,
  hhmmToHours,
  IDEA_CATEGORIES,
  JOURNAL_MOODS,
  MEDITATION_KIND,
  NOTE_DEFAULT_SUBJECT,
  NOTE_DEFAULT_TITLE,
  noteTag,
  splitTags,
  WORK_PROJECTS,
  WORK_STATUSES,
  legacyList,
  legacyObject,
  nextDue,
  PERIOD_FLOWS,
  PET_SPECIES,
  PROJECT_STATUSES,
  SLEEP_QUALITY_LABELS,
  type CareKind,
  type ContentPlatform,
  type ContentStage,
  type GoalCategory,
  type IdeaCategory,
  type LegacyClass,
  type LegacyContent,
  type LegacyData,
  type LegacyIdea,
  type LegacyJournal,
  type LegacyMeditation,
  type LegacyNote,
  type LegacyNoteBox,
  type LegacyPetCare,
  type LegacyReminder,
  type LegacyRoutine,
  type PeriodFlow,
  type PetSpecies,
  type ProjectStatus,
  type StepState,
  type TxType,
  type WorkProject,
  type WorkStatus,
  type LegacyWorkItem,
} from './legacy.js';
import { markdownToText } from './markdown.js';
import { legacyVault, vaultSecureOf } from './vault.js';

/**
 * Herramientas de la app anterior que comparten la web y el móvil: el
 * catálogo de «Más» (grupos, textos y cuentas) y las utilidades de fecha,
 * hora y agenda que usan sus pantallas. Sin dependencias de interfaz.
 */

// ---------- Catálogo de «Más» ----------

export type ToolGroup = 'organizacion' | 'estudio' | 'conocimiento' | 'personal' | 'salud';

/** Subgrupos de «Herramientas» en la barra lateral de la web y en «Más». */
export const TOOL_GROUPS: Array<{ id: ToolGroup; label: string }> = [
  { id: 'organizacion', label: 'Organización' },
  { id: 'estudio', label: 'Estudio y trabajo' },
  { id: 'conocimiento', label: 'Conocimiento' },
  { id: 'personal', label: 'Vida personal' },
  { id: 'salud', label: 'Salud' },
];

export type ToolId =
  | 'agenda'
  | 'pendientes'
  | 'calendario'
  | 'horario'
  | 'enfoque'
  | 'materias'
  | 'proyectos'
  | 'roadmaps'
  | 'cuadernos'
  | 'contenido'
  | 'ideas'
  | 'trabajo'
  | 'notas'
  | 'boveda'
  | 'asistente'
  | 'finanzas'
  | 'metas'
  | 'mascotas'
  | 'ejercicio'
  | 'sueno'
  | 'diario'
  | 'rutina'
  | 'respiracion'
  | 'ciclo';

export interface ToolInfo {
  id: ToolId;
  /** Ruta en la web (y en el móvil, si ya está allí). */
  path: `/${string}`;
  label: string;
  group: ToolGroup;
  description: string;
  /** Cuántos elementos tiene (con su unidad); sin cuenta, se muestra `note`. */
  count?: (d: LegacyData) => number;
  unit?: [string, string];
  note?: string;
  /** Solo aparece en el menú si la persona lo activa (Ciclo, como `showCycle` en la app anterior). */
  optIn?: 'cycle';
}

/** Todas las secciones de la app anterior, reconstruidas en la app nueva (tandas 1 a 4). */
export const TOOL_CATALOG: ToolInfo[] = [
  {
    id: 'agenda',
    path: '/agenda',
    label: 'Agenda',
    group: 'organizacion',
    description: 'Bloques de tu día y tareas por prioridad',
    count: (d) => legacyList(d, 'blocks').length + legacyList(d, 'tasks').length,
    unit: ['elemento', 'elementos'],
  },
  {
    id: 'pendientes',
    path: '/pendientes',
    label: 'Pendientes',
    group: 'organizacion',
    description: 'Tu lista de cosas por hacer, con subtareas',
    count: (d) => legacyList(d, 'todos').filter((t) => !t.done).length,
    unit: ['por hacer', 'por hacer'],
  },
  {
    id: 'calendario',
    path: '/calendario',
    label: 'Calendario',
    group: 'organizacion',
    description: 'Eventos de cada mes, entrenos, metas y diario',
    count: (d) => legacyList(d, 'reminders').length,
    unit: ['evento', 'eventos'],
  },
  {
    id: 'horario',
    path: '/horario',
    label: 'Horario',
    group: 'organizacion',
    description: 'Tus clases de la semana',
    count: (d) => legacyList(d, 'classes').length,
    unit: ['clase', 'clases'],
  },
  {
    id: 'enfoque',
    path: '/enfoque',
    label: 'Enfoque',
    group: 'organizacion',
    description: 'Temporizador Pomodoro y tus horas de concentración',
    count: (d) => legacyList(d, 'focus').filter((f) => f.mode === 'focus').length,
    unit: ['sesión', 'sesiones'],
  },
  {
    id: 'materias',
    path: '/materias',
    label: 'Materias',
    group: 'estudio',
    description: 'Asignaturas, temas y avance del curso',
    count: (d) => legacyList(d, 'subjects').length,
    unit: ['materia', 'materias'],
  },
  {
    id: 'proyectos',
    path: '/proyectos',
    label: 'Proyectos',
    group: 'estudio',
    description: 'Trabajos y entregas con hitos y progreso',
    count: (d) => legacyList(d, 'projects').filter((p) => p.status !== 'entregado').length,
    unit: ['activo', 'activos'],
  },
  {
    id: 'roadmaps',
    path: '/roadmaps',
    label: 'Roadmaps',
    group: 'estudio',
    description: 'Tu ruta de estudio paso a paso',
    count: (d) => legacyList(d, 'roadmaps').length,
    unit: ['ruta', 'rutas'],
  },
  {
    id: 'cuadernos',
    path: '/cuadernos',
    label: 'Cuadernos',
    group: 'estudio',
    description: 'Apuntes en cajitas de texto y de código',
    count: (d) => legacyList(d, 'notebooks').length,
    unit: ['cuaderno', 'cuadernos'],
  },
  {
    id: 'contenido',
    path: '/contenido',
    label: 'Contenido',
    group: 'estudio',
    description: 'Tus videos: guion, notas y publicación',
    count: (d) => legacyList(d, 'content').length,
    unit: ['video', 'videos'],
  },
  {
    id: 'ideas',
    path: '/ideas',
    label: 'Ideas',
    group: 'estudio',
    description: 'Tu banco de ideas de apps, webs y marketing',
    count: (d) => legacyList(d, 'ideas').length,
    unit: ['idea', 'ideas'],
  },
  {
    id: 'trabajo',
    path: '/trabajo',
    label: 'Trabajo',
    group: 'estudio',
    description: 'Tareas de trabajo por proyecto, de la app anterior',
    count: (d) => legacyList(d, 'workItems').filter((w) => !w.done).length,
    unit: ['por hacer', 'por hacer'],
  },
  {
    id: 'notas',
    path: '/notas',
    label: 'Notas',
    group: 'conocimiento',
    description: 'Apuntes en Markdown por materia, con imágenes',
    count: (d) => legacyList(d, 'notes').length,
    unit: ['nota', 'notas'],
  },
  {
    id: 'boveda',
    path: '/boveda',
    label: 'Bóveda',
    group: 'conocimiento',
    description: 'Contraseñas cifradas en tu dispositivo',
    count: (d) => (vaultSecureOf(d)?.items.length ?? 0) + legacyVault(d).length,
    unit: ['entrada', 'entradas'],
  },
  {
    id: 'asistente',
    path: '/asistente',
    label: 'Asistente',
    group: 'conocimiento',
    description: 'Chat con Gemini usando tu propia clave',
    note: 'Con tu clave',
  },
  {
    id: 'finanzas',
    path: '/finanzas',
    label: 'Finanzas',
    group: 'personal',
    description: 'Ingresos, gastos por categoría y presupuesto del mes',
    count: (d) => legacyList(d, 'transactions').length,
    unit: ['movimiento', 'movimientos'],
  },
  {
    id: 'metas',
    path: '/metas',
    label: 'Metas',
    group: 'personal',
    description: 'Objetivos con progreso y fecha límite',
    count: (d) => legacyList(d, 'goals').filter((g) => !g.done).length,
    unit: ['en curso', 'en curso'],
  },
  {
    id: 'mascotas',
    path: '/mascotas',
    label: 'Mascotas',
    group: 'personal',
    description: 'Tus mascotas y sus cuidados de cada día',
    count: (d) => legacyList(d, 'pets').length,
    unit: ['mascota', 'mascotas'],
  },
  {
    id: 'ejercicio',
    path: '/ejercicio',
    label: 'Ejercicio',
    group: 'salud',
    description: 'Planes de entreno y tu historial',
    count: (d) => legacyList(d, 'workouts').length,
    unit: ['entreno', 'entrenos'],
  },
  {
    id: 'sueno',
    path: '/sueno',
    label: 'Sueño',
    group: 'salud',
    description: 'Horas y calidad de tus noches',
    count: (d) => legacyList(d, 'sleep').length,
    unit: ['noche', 'noches'],
  },
  {
    id: 'diario',
    path: '/diario',
    label: 'Diario',
    group: 'salud',
    description: 'Ánimo, gratitud y notas de cada día',
    count: (d) => legacyList(d, 'journal').length,
    unit: ['entrada', 'entradas'],
  },
  {
    id: 'rutina',
    path: '/rutina',
    label: 'Rutina',
    group: 'salud',
    description: 'Rutinas por hora y día, comidas y agua',
    count: (d) => legacyList(d, 'routines').length,
    unit: ['rutina', 'rutinas'],
  },
  {
    id: 'respiracion',
    path: '/respiracion',
    label: 'Respiración',
    group: 'salud',
    description: 'Respiración guiada y tus minutos de calma',
    count: (d) => legacyList(d, 'meditations').length,
    unit: ['sesión', 'sesiones'],
  },
  {
    id: 'ciclo',
    path: '/ciclo',
    label: 'Ciclo',
    group: 'salud',
    description: 'Registro de tu regla y previsión del próximo periodo',
    count: (d) => legacyList(d, 'period').length,
    unit: ['día registrado', 'días registrados'],
    optIn: 'cycle',
  },
];

/** Lo que se muestra junto a cada herramienta en «Más»: «3 eventos», «Vacío» o su nota. */
export function toolStatus(tool: Pick<ToolInfo, 'count' | 'unit' | 'note'>, data: LegacyData | undefined): string {
  if (tool.count && tool.unit) {
    const n = data ? tool.count(data) : 0;
    return n ? plural(n, tool.unit[0], tool.unit[1]) : 'Vacío';
  }
  return tool.note ?? '';
}

// ---------- Horas y fechas locales ----------

/** 1.5 → "1 h 30 min"; 0.5 → "30 min". */
export function durationLabel(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** 1.25 → "1,3 h" (una cifra decimal, formato español). */
export const hoursShort = (h: number) => `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(h)} h`;

/** Hora local actual en horas decimales. */
export const nowHours = (d = new Date()) => d.getHours() + d.getMinutes() / 60;

/** Día de la semana local, 1 = lunes … 7 = domingo. */
export const isoDay = (d = new Date()) => (d.getDay() === 0 ? 7 : d.getDay());

/** "2026-09-25" de una fecha local. */
export const localDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "HH:MM" de una fecha local. */
export const localTime = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Cantidades sin moneda, como la app anterior (`toLocaleString("es")`): 1234.5 → "1234,5"; 12345 → "12.345". */
export const money = (n: number) => new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(n);

/** 465 → "7 h 45 min". */
export const minutesLabel = (m: number) => durationLabel(m / 60);

export interface Placed<T> {
  item: T;
  start: number;
  end: number;
  /** Columna dentro de su grupo de solapes y número de columnas del grupo. */
  lane: number;
  lanes: number;
}

/** Reparte en columnas los elementos que se solapan (como un calendario). */
export function layoutLanes<T>(items: Array<{ item: T; start: number; end: number }>): Array<Placed<T>> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Array<Placed<T>> = [];
  let group: Array<Placed<T>> = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const flush = () => {
    const lanes = laneEnds.length;
    group.forEach((g) => (g.lanes = lanes));
    out.push(...group);
    group = [];
    laneEnds = [];
    groupEnd = -Infinity;
  };
  for (const it of sorted) {
    if (group.length && it.start >= groupEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else laneEnds[lane] = it.end;
    group.push({ ...it, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}

/** Días de un mes en una cuadrícula de lunes a domingo (null = hueco). */
export function monthWeeks(month: string): Array<Array<string | null>> {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const lead = first === 0 ? 6 : first - 1;
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** Cabecera de la semana en los calendarios: letra visible y nombre completo para lectores. */
export const WEEK_HEAD = [
  ['L', 'lunes'],
  ['M', 'martes'],
  ['X', 'miércoles'],
  ['J', 'jueves'],
  ['V', 'viernes'],
  ['S', 'sábado'],
  ['D', 'domingo'],
] as const;

/** Días del mes de `month` ("2026-09-01"). */
export const daysInMonth = (month: Day) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/** Primer día del mes `n` meses antes o después. */
export const shiftMonth = (month: Day, n: number): Day => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 10);

// ---------- Agenda ----------

/** Pasos de media hora entre `from` y `to` (incluidos). */
export const halfHours = (from: number, to: number) => Array.from({ length: Math.round((to - from) * 2) + 1 }, (_, i) => from + i / 2);

/** Bloques que se pueden dibujar (datos antiguos raros se ignoran, sin cambiarlos). */
export const drawableBlocks = <T extends { start: unknown; dur: unknown }>(blocks: T[]): Array<T & { start: number; dur: number }> =>
  blocks.filter((b): b is T & { start: number; dur: number } => typeof b.start === 'number' && typeof b.dur === 'number' && Number.isFinite(b.start) && Number.isFinite(b.dur) && b.dur > 0);

// ---------- Horario ----------

export const CLASS_DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

/** "HH:MM" de 00:00 a 23:59, como guarda la app anterior. */
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Una clase con día y horas válidos (fin posterior al inicio). */
export const validClass = (c: LegacyClass) => Number.isInteger(c.day) && c.day >= 1 && c.day <= 7 && HHMM_RE.test(c.start) && HHMM_RE.test(c.end) && c.end > c.start;

/** "8:30" → "08:30"; "0830" → "08:30". Lo que no se entiende se devuelve tal cual. */
export function normalizeHHMM(v: string): string {
  const t = v.trim();
  const m = /^(\d{1,2})[:.h]?(\d{2})$/.exec(t);
  if (!m) return t;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** La clase en curso o la siguiente de la semana (las clases se repiten cada semana). */
export function nextClass(classes: LegacyClass[], now: Date): { c: LegacyClass; wait: number; ongoing: boolean } | null {
  const nowMin = (isoDay(now) - 1) * 1440 + now.getHours() * 60 + now.getMinutes();
  let best: { c: LegacyClass; wait: number; ongoing: boolean } | null = null;
  for (const c of classes) {
    const start = (c.day - 1) * 1440 + hhmmToHours(c.start) * 60;
    const end = (c.day - 1) * 1440 + hhmmToHours(c.end) * 60;
    const ongoing = nowMin >= start && nowMin < end;
    const wait = ongoing ? -1 : (start - nowMin + 7 * 1440) % (7 * 1440);
    if (!best || wait < best.wait) best = { c, wait, ongoing };
  }
  return best;
}

/** «Ahora, hasta las 10:00», «Hoy a las 12:00 · en 2 h», «Mañana a las 8:00» o «Jueves a las 9:00». */
export function classWhenLabel(c: LegacyClass, wait: number, ongoing: boolean, now: Date): string {
  if (ongoing) return `Ahora, hasta las ${c.end}`;
  const today = isoDay(now);
  const inDays = (c.day - today + 7) % 7;
  if (inDays === 0 && wait < 1440) return `Hoy a las ${c.start} · en ${durationLabel(Math.max(wait, 1) / 60)}`;
  if (inDays === 1) return `Mañana a las ${c.start}`;
  return `${CLASS_DAY_NAMES[c.day - 1]} a las ${c.start}`;
}

/** Texto para lectores de pantalla de una clase. */
export const classDescription = (c: LegacyClass) => `${c.title}, ${CLASS_DAY_NAMES[c.day - 1].toLowerCase()} de ${c.start} a ${c.end}${c.room ? `, aula ${c.room}` : ''}`;

// ---------- Enfoque ----------

/** 1500000 → "25:00". */
export const focusClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** 90500 → "1 minuto y 31 segundos" (para lectores de pantalla). */
export const focusSpoken = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return [m && `${m} ${m === 1 ? 'minuto' : 'minutos'}`, r && `${r} ${r === 1 ? 'segundo' : 'segundos'}`].filter(Boolean).join(' y ') || '0 segundos';
};

// ---------- Calendario ----------

/** Marcas de cada día: eventos propios y, de solo lectura, lo que viene de otras secciones. */
export const CALENDAR_MARKS = {
  event: 'Evento',
  workout: 'Entreno',
  goal: 'Meta',
  journal: 'Diario',
  // Solo si Ciclo está activado, como en la app anterior (`user.showCycle`).
  period: 'Regla',
  predicted: 'Regla prevista',
} as const;
export type CalendarMark = keyof typeof CALENDAR_MARKS;

export interface CalendarWorkout {
  date?: unknown;
  plan?: unknown;
  minutes?: unknown;
}
export interface CalendarGoal {
  deadline?: unknown;
  title?: unknown;
}
export interface CalendarJournal {
  date?: unknown;
  mood?: unknown;
  note?: unknown;
  gratitude?: unknown;
}

/** Lista de otra sección leída con cuidado: solo objetos (la app anterior hacía `x || []`). */
export const looseList = <T>(data: Record<string, unknown> | undefined, key: string): T[] =>
  data && Array.isArray(data[key]) ? (data[key] as T[]).filter((x) => !!x && typeof x === 'object') : [];

/** Regla registrada y prevista del mes (misma estimación que Ciclo). Vacío si Ciclo no está activado. */
export function calendarCycleDays(data: LegacyData | undefined, month: Day, today: Day, showCycle: boolean): { period: Set<Day>; predicted: Set<Day> } {
  if (!showCycle) return { period: new Set(), predicted: new Set() };
  const period = legacyList(data, 'period');
  const cycle = legacyObject(data, 'cycle');
  const registered = new Set(period.map((p) => p.date).filter(isDay));
  const end = addDays(month, daysInMonth(month) - 1);
  return { period: registered, predicted: cyclePredictions(cycleInfo(period, cycle, today), cycle, month, end, registered).period };
}

/** Qué hay cada día del mes visible. Los eventos solo guardan el día del mes: se repiten todos los meses. */
export function calendarMarks(data: LegacyData | undefined, month: Day, cycleDays: { period: Set<Day>; predicted: Set<Day> }): Map<Day, Set<CalendarMark>> {
  const byDay = new Map<Day, Set<CalendarMark>>();
  const add = (d: unknown, k: CalendarMark) => {
    if (typeof d !== 'string' || !d.startsWith(month.slice(0, 7))) return;
    const key = d.slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? new Set()).add(k));
  };
  const n = daysInMonth(month);
  for (const r of legacyList(data, 'reminders')) {
    if (r.on !== false && Number.isInteger(r.day) && r.day >= 1 && r.day <= n) add(`${month.slice(0, 8)}${String(r.day).padStart(2, '0')}`, 'event');
  }
  looseList<CalendarWorkout>(data, 'workouts').forEach((w) => add(w.date, 'workout'));
  looseList<CalendarGoal>(data, 'goals').forEach((g) => add(g.deadline, 'goal'));
  looseList<CalendarJournal>(data, 'journal').forEach((j) => add(j.date, 'journal'));
  cycleDays.period.forEach((day) => add(day, 'period'));
  cycleDays.predicted.forEach((day) => add(day, 'predicted'));
  return byDay;
}

/** «: 2 eventos, entreno» para el nombre accesible de un día. */
export function describeCalendarDay(day: Day, marks: Map<Day, Set<CalendarMark>>, reminders: LegacyReminder[]): string {
  const set = marks.get(day);
  if (!set) return '';
  const dayNum = Number(day.slice(8));
  const events = reminders.filter((r) => r.on !== false && r.day === dayNum).length;
  const parts = [...set].map((k) => (k === 'event' ? `${events} ${events === 1 ? 'evento' : 'eventos'}` : CALENDAR_MARKS[k].toLowerCase()));
  return `: ${parts.join(', ')}`;
}

// ---------- Tanda 2: Materias, Proyectos, Roadmaps, Cuadernos, Contenido e Ideas ----------

/** Color guardado si es un hex válido; si no, el de reserva. */
export const safeColor = (c: unknown, fallback: string): string => (typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : fallback);

/** Paleta con el color actual añadido si no está en ella (datos antiguos o copiados de una materia). */
export const paletteWith = (palette: readonly string[], color: string): string[] => (palette.some((c) => c.toLowerCase() === color.toLowerCase()) ? [...palette] : [...palette, color]);

/** Opciones de una lista con el valor actual añadido si no está en ella. */
export const optionsWith = (list: readonly string[], value: string): string[] => (!value || list.includes(value) ? [...list] : [...list, value]);

/** Id de un tema, hito o paso: randomUUID o "x" + 7 caracteres, como la app anterior. */
export function newLegacySubId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return `x${Math.random().toString(36).slice(2, 9)}`;
}

/** Textos distintos y no vacíos, en orden alfabético español (filtros y sugerencias de Cuadernos). */
export const uniqueTexts = (list: unknown[]): string[] =>
  Array.from(new Set(list.filter((x): x is string => typeof x === 'string' && !!x.trim()))).sort((a, b) => a.localeCompare(b, 'es'));

/** Nombres de las materias del documento (sugerencias de Cuadernos). */
export function legacySubjectNames(data: Record<string, unknown> | undefined): string[] {
  const list = data?.subjects;
  return Array.isArray(list) ? uniqueTexts(list.map((s) => (s && typeof s === 'object' ? (s as { name?: unknown }).name : null))) : [];
}

// Un valor desconocido se muestra como el de por defecto, sin cambiar el dato.
export const projectStatusOf = (p: { status?: unknown }): ProjectStatus => (PROJECT_STATUSES.includes(p.status as ProjectStatus) ? (p.status as ProjectStatus) : 'curso');
export const contentPlatformOf = (c: Pick<LegacyContent, 'platform'>): ContentPlatform => (CONTENT_PLATFORMS.includes(c.platform) ? c.platform : 'otro');
export const contentStageOf = (c: Pick<LegacyContent, 'stage'>): ContentStage => (CONTENT_STAGES.includes(c.stage) ? c.stage : 'idea');
export const ideaCategoryOf = (i: Pick<LegacyIdea, 'category'>): IdeaCategory => (IDEA_CATEGORIES.includes(i.category) ? i.category : 'otro');

/** Nombre de cada estado de un paso de roadmap. */
export const STEP_STATE_LABEL: Record<StepState, string> = { done: 'Completada', current: 'En curso', next: 'Siguiente', locked: 'Bloqueada' };

/** Clases por día de la semana y hora (la primera es la «próxima» de una materia). */
export const byWeekday = (a: LegacyClass, b: LegacyClass) => a.day - b.day || String(a.start).localeCompare(String(b.start));

/** Tipo de una cajita: cualquier otro valor es de texto, como en la app anterior. */
export const noteBoxKind = (b: Pick<LegacyNoteBox, 'kind'>): 'text' | 'code' => (b.kind === 'code' ? 'code' : 'text');

/** Cajita nueva como la crea la app anterior: amarilla de texto, o de código oscura en `js`. */
export const newNoteBox = (id: string, notebookId: string, kind: 'text' | 'code'): LegacyNoteBox => ({
  id,
  notebookId,
  title: '',
  text: '',
  color: kind === 'code' ? CODE_BOX_COLOR : BOX_COLORS[0],
  kind,
  lang: kind === 'code' ? CODE_LANGS[0] : '',
});

/** Referencia a una imagen de la app anterior (`coreimg:<id>`), guardada en la nube con /api/images. */
export const CORE_IMG = /coreimg:([A-Za-z0-9_-]{1,80})/g;
const DATA_IMG_IN_TEXT = /data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/g;
/** Imagen en base64 que se puede mostrar sin riesgo (solo formatos de imagen de mapa de bits). */
export const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i;

/** Ids `coreimg:` de un texto, sin repetir. */
export const coreImageIds = (text: string): string[] => Array.from(new Set(Array.from(text.matchAll(CORE_IMG), (m) => m[1])));

/** Imágenes incrustadas en base64 en un texto, sin repetir. */
export const inlineImages = (text: string): string[] => Array.from(new Set(text.match(DATA_IMG_IN_TEXT) ?? []));

// ---------- Tanda 3: Finanzas, Metas, Mascotas, Ciclo, Ejercicio, Sueño, Diario y Rutina ----------

/** "12,30" o "12.30" → 12.3 (hasta dos decimales). null si no es una cantidad. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return null;
  return Number(t.replace(',', '.'));
}

/** Todo lo que no es `income` cuenta como gasto, como la app anterior. */
export const txTypeOf = (t: { type?: unknown }): TxType => (t.type === 'income' ? 'income' : 'expense');

/** Del más reciente al más antiguo por `date` (historiales de Finanzas, Ejercicio, Sueño y Diario). */
export const byDateDesc = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** Por hora "HH:MM"; sin hora, al final (rutinas, comidas y cuidados). */
export const byTime = <T extends { time?: string }>(a: T, b: T) => (a.time || '99').localeCompare(b.time || '99');

// Un valor desconocido se muestra como el de por defecto, sin cambiar el dato.
export const goalCategoryOf = (g: { category?: unknown }): GoalCategory => (GOAL_CATEGORIES.includes(g.category as GoalCategory) ? (g.category as GoalCategory) : 'personal');
export const petSpeciesOf = (p: { species?: unknown }): PetSpecies => (PET_SPECIES.includes(p.species as PetSpecies) ? (p.species as PetSpecies) : 'other');
export const careKindOf = (c: { kind?: unknown }): CareKind => (CARE_KINDS.includes(c.kind as CareKind) ? (c.kind as CareKind) : 'otro');
export const periodFlowOf = (p: { flow?: unknown }): PeriodFlow => (PERIOD_FLOWS.includes(p.flow as PeriodFlow) ? (p.flow as PeriodFlow) : 'medium');

/** Días de la semana guardados ("1234567", 1 = lunes); si no son válidos, todos (el valor por defecto de la app anterior). */
export const weekdaysOf = (d: unknown): string => (typeof d === 'string' && /^[1-7]{1,7}$/.test(d) ? d : '1234567');

/** «Vence hoy», «Faltan 3 días · 29 sept», «Venció hace 2 días · 24 sept». null sin fecha válida. */
export function goalDeadlineLabel(deadline: unknown, today: Day): { text: string; late: boolean } | null {
  if (!isDay(deadline)) return null;
  const d = diffDays(today, deadline);
  if (d === 0) return { text: 'Vence hoy', late: false };
  if (d > 0) return { text: `${d === 1 ? 'Falta 1 día' : `Faltan ${d} días`} · ${shortDay(deadline)}`, late: false };
  return { text: `Venció hace ${-d === 1 ? '1 día' : `${-d} días`} · ${shortDay(deadline)}`, late: true };
}

/** Nombre de cada día de la semana (1 = lunes): «El jueves» y nombres para lectores del selector de días. */
export const WEEKDAY_LONG_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;

/** Cuándo toca un cuidado: «Hoy a las 08:00 · pendiente», «Mañana a las 18:00», «El jueves», «Los sábados». */
export function careDueLabel(care: Pick<LegacyPetCare, 'days' | 'time' | 'enabled' | 'lastDone'>, now: Date): string {
  const due = nextDue(care, now);
  if (!due) return 'Aviso desactivado';
  const at = due.time ? ` a las ${due.time}` : '';
  if (due.inDays === 0) return `Hoy${at}${due.late ? ' · pendiente' : ''}`;
  if (due.inDays === 1) return `Mañana${at}`;
  // Si solo toca un día a la semana, «Los sábados» ya dice cuándo es el próximo.
  const days = weekdaysOf(care.days);
  if (days.length === 1) return `${daysLabel(days)}${at}`;
  const iso = ((now.getDay() === 0 ? 7 : now.getDay()) - 1 + due.inDays) % 7;
  return `El ${WEEKDAY_LONG_NAMES[iso]}${at}`;
}

/** Línea de un cuidado: «Hecho hoy · Todos los días» o cuándo toca con sus días. */
export function careWhen(care: Pick<LegacyPetCare, 'days' | 'time' | 'enabled' | 'lastDone'>, done: boolean, now: Date): string {
  const days = daysLabel(weekdaysOf(care.days));
  if (done) return `Hecho hoy · ${days}`;
  const due = careDueLabel(care, now);
  return due.startsWith(days) ? due : `${due} · ${days}`;
}

/** «24–28 sept» dentro del mismo mes; si no, «30 sept – 3 oct». */
export const daySpan = (a: Day, b: Day) => (a === b ? shortDay(a) : a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))}–${shortDay(b)}` : `${shortDay(a)} – ${shortDay(b)}`);

/** Último día del mes de `month` ("2026-09-01" → "2026-09-30"). */
export const monthEnd = (month: Day): Day => addDays(`${month.slice(0, 7)}-01`, daysInMonth(`${month.slice(0, 7)}-01`) - 1);

/** Nombres de los meses en minúscula, como el `when` de los avisos de Ciclo. */
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;

/** Color del aviso de Ciclo: el rosa de la paleta de eventos (el #E5487D de la app anterior no está en ella). */
export const PERIOD_REMINDER_COLOR = '#EC6A9C';

/** «Recordarme el próximo periodo»: un evento del Calendario el día del mes previsto, como la app anterior. */
export const periodReminder = (id: string, nextStart: Day): LegacyReminder => ({
  id,
  day: Number(nextStart.slice(8)),
  title: '🩸 Posible inicio del periodo',
  when: MONTH_NAMES[Number(nextStart.slice(5, 7)) - 1],
  color: PERIOD_REMINDER_COLOR,
  icon: 'doc',
  on: true,
});

/** «Agendar» un plan de Ejercicio: una rutina diaria a las 18:00, como la app anterior. */
export const workoutRoutine = (id: string, plan: string): LegacyRoutine => ({ id, title: `🏋️ Entreno: ${plan}`, time: '18:00', days: '1234567', icon: 'bell', sound: true, enabled: true });

/** Calidad de una noche: «Buena (4/5)» o «Sin calidad». */
export const sleepQualityLabel = (q: unknown) => (typeof q === 'number' && Number.isInteger(q) && q >= 1 && q <= 5 ? `${SLEEP_QUALITY_LABELS[q - 1]} (${q}/5)` : 'Sin calidad');

/** Cifras del Diario: entradas de este mes (UTC), racha de días seguidos y ánimo más frecuente de las últimas 30. */
export function journalStats(list: Array<Pick<LegacyJournal, 'date' | 'mood'>>, today: Day): { month: number; streak: number; top: string | null; topLabel: string | null } {
  const entries = list.filter((j) => isDay(j.date)).sort(byDateDesc);
  const days = new Set(entries.map((e) => e.date));
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  const counts = new Map<string, number>();
  for (const e of entries.slice(0, 30)) if (typeof e.mood === 'string' && e.mood) counts.set(e.mood, (counts.get(e.mood) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    month: entries.filter((e) => e.date.startsWith(today.slice(0, 7))).length,
    streak,
    top,
    topLabel: JOURNAL_MOODS.find((m) => m.emoji === top)?.label ?? null,
  };
}

/** Filtro de días de Rutina: 0 = todos, 1 = lunes … 7 = domingo. */
export const ROUTINE_DAY_FILTERS = [
  { iso: 0, short: 'Todos', long: 'Todos los días' },
  { iso: 1, short: 'L', long: 'Lunes' },
  { iso: 2, short: 'M', long: 'Martes' },
  { iso: 3, short: 'X', long: 'Miércoles' },
  { iso: 4, short: 'J', long: 'Jueves' },
  { iso: 5, short: 'V', long: 'Viernes' },
  { iso: 6, short: 'S', long: 'Sábado' },
  { iso: 7, short: 'D', long: 'Domingo' },
] as const;

/** Añadir o quitar un día ("135" + 2 → "1235"). Nunca deja la lista vacía (devuelve la anterior). */
export function toggleWeekday(days: string, iso: string): string {
  const next = days.includes(iso) ? days.replace(iso, '') : [...days, iso].sort().join('');
  return next || days;
}

// ---------- Tanda 4: Notas, Trabajo y Respiración ----------

/** Orden alfabético español sin distinguir mayúsculas ni tildes. */
export const byNameEs = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });

/** Texto para buscar: sin tildes y en minúsculas («Física» encuentra «fisica»). */
export const searchFold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Una nota con datos raros se muestra con los valores por defecto, sin cambiar el dato.
export const noteSubjectOf = (n: Pick<LegacyNote, 'subject'>): string => (typeof n.subject === 'string' && n.subject.trim() ? n.subject.trim() : NOTE_DEFAULT_SUBJECT);
export const noteTitleOf = (n: Pick<LegacyNote, 'title'>): string => (typeof n.title === 'string' && n.title.trim() ? n.title : NOTE_DEFAULT_TITLE);
export const noteBodyOf = (n: Pick<LegacyNote, 'body'>): string => (typeof n.body === 'string' ? n.body : '');
/** Color de la nota: el guardado (`tag`) o el calculado de su materia. */
export const noteColorOf = (n: Pick<LegacyNote, 'tag' | 'subject'>): string => safeColor(n.tag, noteTag(noteSubjectOf(n)));
/** Texto de la tarjeta: el principio de la nota sin marcas de Markdown. */
export const notePreview = (n: Pick<LegacyNote, 'body'>): string => markdownToText(noteBodyOf(n).slice(0, 1500)).slice(0, 160);

/** Etiquetas de todas las notas, en minúsculas, sin repetir y en orden alfabético. */
export const noteTagList = (notes: Array<Pick<LegacyNote, 'tags'>>): string[] =>
  Array.from(new Set(notes.flatMap((n) => splitTags(n.tags).map((t) => t.toLowerCase())))).sort(byNameEs);

/** Notas que coinciden con la búsqueda (título, materia, etiquetas y texto) y con la etiqueta elegida. */
export function filterNotes<N extends LegacyNote>(notes: N[], query: string, tag: string): N[] {
  const q = searchFold(query.trim());
  return notes.filter(
    (n) =>
      (!tag || splitTags(n.tags).some((t) => t.toLowerCase() === tag)) &&
      (!q || searchFold(`${noteTitleOf(n)} ${noteSubjectOf(n)} ${n.tags ?? ''} ${noteBodyOf(n).slice(0, 20_000)}`).includes(q)),
  );
}

/** Biblioteca por materia, como la app anterior: materias en orden alfabético. */
export function groupNotesBySubject<N extends LegacyNote>(notes: N[]): Array<[string, N[]]> {
  const map = new Map<string, N[]>();
  for (const n of notes) map.set(noteSubjectOf(n), [...(map.get(noteSubjectOf(n)) ?? []), n]);
  return [...map].sort(([a], [b]) => byNameEs(a, b));
}

// Proyecto y estado desconocidos (datos raros) se muestran como el primero, sin cambiar el dato.
export const workProjectOf = (w: Pick<LegacyWorkItem, 'project'>): WorkProject => (WORK_PROJECTS.includes(w.project) ? w.project : 'p1');
export const workStatusOf = (w: Pick<LegacyWorkItem, 'status'>): WorkStatus => (WORK_STATUSES.includes(w.status) ? w.status : 'todo');

/** Mismos grupos que la app anterior: en curso, por hacer y hecho. */
export const WORK_BUCKETS: Array<{ id: 'curso' | 'todo' | 'hecho'; label: string }> = [
  { id: 'curso', label: 'En curso' },
  { id: 'todo', label: 'Por hacer' },
  { id: 'hecho', label: 'Hecho' },
];
export const workBucketOf = (w: Pick<LegacyWorkItem, 'done' | 'status'>): 'curso' | 'todo' | 'hecho' => (w.done ? 'hecho' : workStatusOf(w));

export type BreathPhase = 'in' | 'hold' | 'out';
export type BreathPatternId = 'caja' | '478';

/** Técnicas de respiración de la app anterior (fases con sus segundos). */
export const BREATH_PATTERNS: Record<BreathPatternId, { label: string; hint: string; phases: Array<[BreathPhase, number]> }> = {
  caja: { label: 'Caja 4-4-4-4', hint: 'Inhala 4, mantén 4, exhala 4 y mantén 4 segundos. Ayuda a calmarte y concentrarte.', phases: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]] },
  '478': { label: '4-7-8', hint: 'Inhala 4, mantén 7 y exhala 8 segundos. Ayuda a relajarte antes de dormir.', phases: [['in', 4], ['hold', 7], ['out', 8]] },
};
/** Orden fijo: «478» parece un número y Object.keys lo pondría primero. */
export const BREATH_PATTERN_ORDER: BreathPatternId[] = ['caja', '478'];
export const BREATH_PHASE_LABEL: Record<BreathPhase, string> = { in: 'Inhala', hold: 'Mantén', out: 'Exhala' };
export const BREATH_DURATIONS = [1, 3, 5] as const;
export type BreathMinutes = (typeof BREATH_DURATIONS)[number];

/** Duración de un ciclo completo de la técnica, en milisegundos. */
export const breathCycleMs = (pattern: BreathPatternId) => BREATH_PATTERNS[pattern].phases.reduce((s, [, n]) => s + n, 0) * 1000;

/** Fase de la respiración en un momento de la sesión (en milisegundos desde el inicio). */
export function breathPhase(pattern: BreathPatternId, ms: number): { phase: BreathPhase; index: number; secondsLeft: number; seconds: number } {
  const phases = BREATH_PATTERNS[pattern].phases;
  let t = ms % breathCycleMs(pattern);
  for (let i = 0; i < phases.length; i++) {
    const len = phases[i][1] * 1000;
    if (t < len) return { phase: phases[i][0], index: i, seconds: phases[i][1], secondsLeft: Math.ceil((len - t) / 1000) };
    t -= len;
  }
  return { phase: phases[0][0], index: 0, seconds: phases[0][1], secondsLeft: phases[0][1] };
}

/** El círculo está grande al inhalar y al mantener después de inhalar; pequeño en lo demás. */
export function breathExpanded(pattern: BreathPatternId, index: number): boolean {
  const phases = BREATH_PATTERNS[pattern].phases;
  const phase = phases[index][0];
  const prev = phases[(index + phases.length - 1) % phases.length][0];
  return phase === 'in' || (phase === 'hold' && prev === 'in');
}

/** 90500 → "1:31" (el reloj de Respiración). */
export const breathClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Minutos de hoy, de esta semana y sesiones válidas de Respiración (día en UTC, como la app anterior). */
export function meditationStats(sessions: LegacyMeditation[], today: Day) {
  const valid = sessions.filter((s) => isDay(s.date) && typeof s.minutes === 'number');
  const week = periodRange('week', today);
  return {
    valid,
    todayMinutes: valid.filter((s) => s.date === today).reduce((n, s) => n + s.minutes, 0),
    weekMinutes: valid.filter((s) => s.date >= week.from && s.date <= week.to).reduce((n, s) => n + s.minutes, 0),
  };
}

/** Nombre del tipo de sesión («Respiración» para la de la app anterior o sin tipo). */
export const meditationKindLabel = (kind: unknown) => (kind === MEDITATION_KIND || !kind || typeof kind !== 'string' ? 'Respiración' : kind);

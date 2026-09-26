import { addDays, isDay, type Day } from './dates.js';
import { plural } from './format.js';
import {
  cycleInfo,
  cyclePredictions,
  hhmmToHours,
  legacyList,
  legacyObject,
  type LegacyClass,
  type LegacyData,
  type LegacyReminder,
} from './legacy.js';
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

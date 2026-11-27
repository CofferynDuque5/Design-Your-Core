/**
 * Constancia: el mapa de días seguidos de la pantalla «Hoy», la racha, la
 * mejor racha, las metas de racha y las frases que animan a no soltarla.
 *
 * Un día «cuenta» cuando se hizo algo: un hábito cumplido o el check-in.
 * La intensidad del cuadrito sube con la parte hecha de lo que tocaba.
 */
import { addDays, isoWeekday, type Day, type Range } from './dates.js';
import { legacyList, projectProgress, type LegacyData } from './legacy.js';
import { courseName, firstProject, projectTodos, showableClasses } from './tools.js';

export interface ConsistencyDay {
  date: Day;
  /** Cosas hechas ese día (hábitos cumplidos + check-in). */
  done: number;
  /** Cosas que tocaban (hábitos programados + el check-in). */
  total: number;
}

/** Semanas que muestra el mapa (de lunes a domingo, la última es la actual). */
export const CONSISTENCY_WEEKS = 12;

/** Rachas que se celebran como logros. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 100, 180, 365] as const;

/** Días activos por semana que se proponen como meta. */
export const WEEKLY_TARGET = 5;

/** Desde el lunes de hace 11 semanas hasta hoy. */
export function consistencyRange(today: Day): Range {
  const monday = addDays(today, 1 - isoWeekday(today));
  return { from: addDays(monday, -7 * (CONSISTENCY_WEEKS - 1)), to: today };
}

/** Un día a partir de sus hábitos y de si hubo check-in. */
export function consistencyDay(date: Day, habits: ReadonlyArray<{ done: boolean }>, checkedIn: boolean): ConsistencyDay {
  return { date, done: habits.filter((h) => h.done).length + (checkedIn ? 1 : 0), total: habits.length + 1 };
}

/** 0 = nada, 1–4 = cada vez más completo. */
export function consistencyLevel(d: Pick<ConsistencyDay, 'done' | 'total'>): 0 | 1 | 2 | 3 | 4 {
  if (d.done <= 0) return 0;
  const r = d.total > 0 ? d.done / d.total : 1;
  return r >= 1 ? 4 : r >= 0.66 ? 3 : r >= 0.33 ? 2 : 1;
}

export const CONSISTENCY_LEVEL_LABEL = ['Sin actividad', 'Algo hecho', 'Buena parte hecha', 'Casi todo hecho', 'Día completo'] as const;

export interface ConsistencyStats {
  /** Días seguidos hasta hoy (si hoy aún no cuenta, hasta ayer). */
  streak: number;
  /** La racha más larga dentro del mapa. */
  best: number;
  /** Días con algo hecho en el mapa. */
  activeDays: number;
  /** Días en que se hizo todo lo que tocaba. */
  perfectDays: number;
  /** Hoy ya cuenta. */
  todayDone: boolean;
  /** Días con algo hecho en esta semana (lunes a hoy). */
  weekActive: number;
  /** Próxima racha a celebrar y cuántos días faltan. */
  next: { target: number; left: number } | null;
  /** Rachas ya conseguidas (según la mejor). */
  reached: number[];
}

export function consistencyStats(days: readonly ConsistencyDay[], today: Day): ConsistencyStats {
  const active = new Set(days.filter((d) => d.date <= today && d.done > 0).map((d) => d.date));
  const todayDone = active.has(today);
  let streak = 0;
  for (let d = todayDone ? today : addDays(today, -1); active.has(d); d = addDays(d, -1)) streak++;

  let best = 0;
  let run = 0;
  let prev: Day | null = null;
  for (const d of [...days].filter((x) => x.date <= today).sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.done > 0) {
      run = prev && addDays(prev, 1) === d.date ? run + 1 : 1;
      prev = d.date;
      best = Math.max(best, run);
    } else {
      run = 0;
      prev = null;
    }
  }
  best = Math.max(best, streak);

  const monday = addDays(today, 1 - isoWeekday(today));
  const weekActive = [...active].filter((d) => d >= monday).length;
  const target = STREAK_MILESTONES.find((m) => m > streak);
  return {
    streak,
    best,
    activeDays: active.size,
    perfectDays: days.filter((d) => d.date <= today && d.total > 0 && d.done >= d.total).length,
    todayDone,
    weekActive,
    next: target ? { target, left: target - streak } : null,
    reached: STREAK_MILESTONES.filter((m) => m <= best),
  };
}

/**
 * Columnas del mapa: una por semana, siete filas (lunes a domingo). Los días
 * futuros o sin datos quedan como `null` o con `done = 0`.
 */
export function consistencyGrid(days: readonly ConsistencyDay[], today: Day): Array<Array<ConsistencyDay | null>> {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const { from } = consistencyRange(today);
  return Array.from({ length: CONSISTENCY_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(from, w * 7 + i);
      if (date > today) return null;
      return byDate.get(date) ?? { date, done: 0, total: 0 };
    }),
  );
}

/** Frase según cómo va la racha: lo primero que se lee en la tarjeta. */
export function streakNudge(s: Pick<ConsistencyStats, 'streak' | 'best' | 'todayDone' | 'next'>): string {
  if (s.todayDone && s.streak >= 2) return s.next ? `Hoy ya cuenta. Te faltan ${s.next.left} ${s.next.left === 1 ? 'día' : 'días'} para llegar a ${s.next.target} seguidos.` : `Hoy ya cuenta. Llevas ${s.streak} días seguidos.`;
  if (s.todayDone) return 'Hoy ya cuenta. Mañana repite y empieza tu racha.';
  if (s.streak > 0) return `Aún estás a tiempo: marca algo hoy y tu racha sube a ${s.streak + 1}.`;
  if (s.best > 0) return `Tu mejor racha fue de ${s.best} ${s.best === 1 ? 'día' : 'días'}. Empieza otra hoy con algo pequeño.`;
  return 'Marca un hábito o haz tu check-in: así empieza tu racha.';
}

const PHRASES = [
  'Pequeño y diario le gana a grande y de vez en cuando.',
  'No hace falta ganas, hace falta empezar.',
  'Hoy solo tienes que no romper la cadena.',
  'Dos minutos cuentan. Empieza por ahí.',
  'Un día flojo no borra una semana buena.',
  'La constancia se construye, no se encuentra.',
  'Haz la versión mínima: también cuenta.',
  'Tu yo de mañana te lo va a agradecer.',
  'Avanzar lento sigue siendo avanzar.',
  'Si se rompe la racha, lo importante es volver mañana.',
  'Elige una cosa y termínala.',
  'Lo difícil es empezar; lo demás es repetir.',
  'Lo que repites cada día es lo que te vas volviendo.',
  'Hecho es mejor que perfecto.',
] as const;

/** Una frase distinta cada día (la misma para todo el día). */
export function phraseOfDay(today: Day): string {
  const n = Math.floor(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10))) / 86_400_000);
  return PHRASES[((n % PHRASES.length) + PHRASES.length) % PHRASES.length];
}

export interface DayPlanItem {
  id: string;
  /** «HH:MM». */
  time: string;
  end?: string;
  title: string;
  kind: 'clase' | 'curso' | 'rutina' | 'tarea';
  url: string;
}

export const DAY_PLAN_KIND_LABEL: Record<DayPlanItem['kind'], string> = { clase: 'Horario', curso: 'Curso', rutina: 'Rutina', tarea: 'Agenda' };

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const pad = (t: string) => (t.length === 4 ? `0${t}` : t);

/** Lo que tiene hora hoy: clases y cursos del horario, rutinas y tareas de la agenda. */
export function dayPlan(data: LegacyData | null | undefined, now: Date = new Date()): DayPlanItem[] {
  const weekday = now.getDay() === 0 ? 7 : now.getDay();
  const out: DayPlanItem[] = [];
  const courses = new Map(legacyList(data, 'courses').map((c) => [c.id, c]));
  for (const k of showableClasses(legacyList(data, 'classes'))) {
    if (k.day !== weekday) continue;
    const course = k.course ? courses.get(k.course) : undefined;
    if (course?.status === 'hecho') continue;
    out.push(
      course
        ? { id: `class-${k.id}`, time: k.start, end: k.end, title: courseName(course), kind: 'curso', url: `/cursos?abrir=${encodeURIComponent(course.id)}` }
        : { id: `class-${k.id}`, time: k.start, end: k.end, title: k.title, kind: 'clase', url: '/horario' },
    );
  }
  for (const r of legacyList(data, 'routines')) {
    if (r.enabled === false || !r.title || !HHMM.test(r.time ?? '')) continue;
    if (!(r.days || '1234567').includes(String(weekday))) continue;
    out.push({ id: `routine-${r.id}`, time: pad(r.time), title: r.title, kind: 'rutina', url: '/rutina' });
  }
  for (const t of legacyList(data, 'tasks')) {
    if (t.done || !t.time || !HHMM.test(t.time)) continue;
    out.push({ id: `task-${t.id}`, time: pad(t.time), title: t.title, kind: 'tarea', url: '/agenda?vista=tareas' });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
}

/** Lo que queda del día: lo que está en curso y lo que viene. */
export function upcoming(plan: readonly DayPlanItem[], now: Date = new Date(), max = 5): Array<DayPlanItem & { now: boolean }> {
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return plan
    .filter((i) => (i.end ?? i.time) >= hm)
    .slice(0, max)
    .map((i) => ({ ...i, now: i.time <= hm }));
}

export interface DayFocus {
  /** Lo que se destaca en grande. */
  title: string;
  /** El siguiente paso o por qué toca. */
  detail: string;
  /** Dónde se trabaja. */
  url: string;
  linkLabel: string;
}

/**
 * Lo único importante de hoy: el siguiente paso del proyecto que toca
 * terminar primero; si no hay, la tarea más urgente de la agenda; si no, el
 * primer hábito pendiente.
 */
export function dayFocus(data: LegacyData | null | undefined, habits: ReadonlyArray<{ title: string; done: boolean }>): DayFocus | null {
  const p = firstProject(legacyList(data, 'projects'));
  if (p) {
    const todos = projectTodos(p, () => '').filter((t) => !t.done);
    const next = todos.find((t) => t.kind === 'falta') ?? todos[0];
    const name = p.title?.trim() || 'Tu proyecto';
    return {
      title: next ? next.name : name,
      detail: next ? `Siguiente paso de «${name}», el proyecto que toca terminar primero.` : `Lleva ${projectProgress(p)} % hecho. Dale el empujón que falta.`,
      url: '/proyectos',
      linkLabel: 'Abrir el proyecto',
    };
  }
  const order = { alta: 0, media: 1, baja: 2 } as Record<string, number>;
  const task = legacyList(data, 'tasks')
    .filter((t) => !t.done && t.title)
    .sort((a, b) => (order[a.pri] ?? 1) - (order[b.pri] ?? 1) || String(a.time ?? '99').localeCompare(String(b.time ?? '99')))[0];
  if (task) return { title: task.title, detail: task.time ? `En tu agenda a las ${task.time}.` : 'Es lo más urgente de tu agenda.', url: '/agenda?vista=tareas', linkLabel: 'Abrir la agenda' };
  const habit = habits.find((h) => !h.done);
  if (habit) return { title: habit.title, detail: 'Es el hábito que te falta hoy.', url: '/habitos', linkLabel: 'Ver hábitos' };
  return null;
}

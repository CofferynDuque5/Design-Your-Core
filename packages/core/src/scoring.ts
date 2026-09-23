import { isoWeekday, type Day } from './dates.js';
import { PILLAR_IDS, pillarRecord, type PillarId, type PillarRecord } from './pillars.js';

/**
 * Puntuación de cada pilar, de 0 a 100, a partir del check-in del día y de
 * los hábitos cumplidos. Un pilar sin datos queda en null: no se castiga lo
 * que la persona no registró.
 */

export interface CheckInSignals {
  mood?: number | null;
  energy?: number | null;
  stress?: number | null;
  sleepHours?: number | null;
  sleepQuality?: number | null;
  activeMinutes?: number | null;
  nutrition?: number | null;
  water?: number | null;
  connection?: number | null;
  purpose?: number | null;
  note?: string | null;
  gratitude?: string | null;
}

export interface HabitDay {
  pillar: PillarId;
  done: boolean;
}

export type PillarScores = PillarRecord<number | null>;

/** Metas de referencia usadas por la puntuación. */
export const TARGETS = {
  activeMinutes: 30,
  water: 8,
  sleepMin: 7,
  sleepMax: 9,
} as const;

/** Peso del check-in frente a los hábitos cuando hay ambos. */
const CHECKIN_WEIGHT = 0.7;

const scale5 = (v: number) => (v - 1) / 4;
const has = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function sleepHoursScore(h: number): number {
  if (h >= TARGETS.sleepMin && h <= TARGETS.sleepMax) return 1;
  if (h < TARGETS.sleepMin) return Math.max(0, 1 - (TARGETS.sleepMin - h) / 4);
  return Math.max(0, 1 - (h - TARGETS.sleepMax) / 3);
}

/** Parte de la puntuación que sale del check-in, de 0 a 1 por pilar. */
export function checkInParts(c: CheckInSignals | null | undefined): PillarRecord<number | null> {
  if (!c) return pillarRecord(() => null);
  const parts: PillarRecord<number[]> = pillarRecord(() => []);
  if (has(c.activeMinutes)) parts.movimiento.push(Math.min(c.activeMinutes / TARGETS.activeMinutes, 1));
  if (has(c.energy)) parts.movimiento.push(scale5(c.energy));
  if (has(c.sleepHours)) parts.descanso.push(sleepHoursScore(c.sleepHours));
  if (has(c.sleepQuality)) parts.descanso.push(scale5(c.sleepQuality));
  if (has(c.nutrition)) parts.alimentacion.push(scale5(c.nutrition));
  if (has(c.water)) parts.alimentacion.push(Math.min(c.water / TARGETS.water, 1));
  if (has(c.mood)) parts.enfoque.push(scale5(c.mood));
  if (has(c.stress)) parts.enfoque.push(1 - scale5(c.stress));
  if (has(c.connection)) parts.relaciones.push(scale5(c.connection));
  if (has(c.purpose)) parts.proposito.push(scale5(c.purpose));
  // Escribir una reflexión suma a propósito, pero no escribirla no resta.
  if ((c.note && c.note.trim()) || (c.gratitude && c.gratitude.trim())) parts.proposito.push(1);
  return pillarRecord((id) => mean(parts[id]));
}

export function dayScores(checkIn: CheckInSignals | null | undefined, habits: HabitDay[] = []): PillarScores {
  const fromCheckIn = checkInParts(checkIn);
  return pillarRecord((id) => {
    const own = habits.filter((h) => h.pillar === id);
    const habitRate = own.length ? own.filter((h) => h.done).length / own.length : null;
    const c = fromCheckIn[id];
    let v: number | null;
    if (c !== null && habitRate !== null) v = CHECKIN_WEIGHT * c + (1 - CHECKIN_WEIGHT) * habitRate;
    else v = c ?? habitRate;
    return v === null ? null : Math.round(v * 100);
  });
}

/** Promedio del pilar en varios días, ignorando los días sin datos. */
export function averageScores(days: PillarScores[]): { scores: PillarScores; daysWithData: PillarRecord<number> } {
  const scores = pillarRecord((id) => {
    const vals = days.map((d) => d[id]).filter(has);
    const m = mean(vals);
    return m === null ? null : Math.round(m);
  });
  const daysWithData = pillarRecord((id) => days.filter((d) => has(d[id])).length);
  return { scores, daysWithData };
}

/** Puntuación global: promedio de los pilares con datos. */
export function overallScore(scores: PillarScores): number | null {
  const m = mean(PILLAR_IDS.map((id) => scores[id]).filter(has));
  return m === null ? null : Math.round(m);
}

/** Hábito programado para un día según sus días ISO ("12345" = entre semana). */
export const isScheduled = (days: string, d: Day) => days.includes(String(isoWeekday(d)));

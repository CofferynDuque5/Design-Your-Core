import {
  addDays,
  averageScores,
  dayScores,
  daysIn,
  isScheduled,
  overallScore,
  PILLAR_IDS,
  pillarRecord,
  type Day,
  type HabitDay,
  type PillarScores,
  type Range,
} from '@dyc/core';
import type { Db } from '../db/db.js';
import type { CheckIn, Habit, HabitLog } from '../db/types.js';
import { fromDb, toDb } from './util.js';

/** Datos de un rango de días, listos para puntuar. */
export interface DayData {
  checkIns: Map<Day, CheckIn>;
  habits: Array<Habit & { logs: HabitLog[] }>;
}

export async function loadDays(db: Db, userId: string, range: Range): Promise<DayData> {
  const from = toDb(range.from);
  const to = toDb(range.to);
  const [checkIns, habits, logs] = await Promise.all([
    db.rows<CheckIn>('SELECT * FROM "CheckIn" WHERE "userId" = $1 AND "date" BETWEEN $2 AND $3', [userId, from, to]),
    db.rows<Habit>('SELECT * FROM "Habit" WHERE "userId" = $1 AND ("archivedAt" IS NULL OR "archivedAt" >= $2) ORDER BY "createdAt" ASC', [userId, from]),
    db.rows<HabitLog>(
      `SELECT l.* FROM "HabitLog" l JOIN "Habit" h ON h."id" = l."habitId"
       WHERE h."userId" = $1 AND (h."archivedAt" IS NULL OR h."archivedAt" >= $2) AND l."date" BETWEEN $2 AND $3`,
      [userId, from, to],
    ),
  ]);
  return {
    checkIns: new Map(checkIns.map((c) => [fromDb(c.date), c])),
    habits: habits.map((h) => ({ ...h, logs: logs.filter((l) => l.habitId === h.id) })),
  };
}

/** Hábitos que tocaban ese día y si se cumplieron. */
export function habitsOn(data: DayData, d: Day): Array<HabitDay & { id: string; title: string }> {
  return data.habits
    .filter((h) => fromDb(h.startsOn) <= d && (!h.archivedAt || fromDb(h.archivedAt) > d) && isScheduled(h.days, d))
    .map((h) => ({
      id: h.id,
      title: h.title,
      pillar: h.pillar as HabitDay['pillar'],
      done: h.logs.some((l) => l.done && fromDb(l.date) === d),
    }));
}

/** Puntuación por día; los días futuros quedan vacíos. */
export function scoreDays(data: DayData, days: Day[], today: Day): Map<Day, PillarScores> {
  const out = new Map<Day, PillarScores>();
  for (const d of days) {
    out.set(d, d > today ? pillarRecord(() => null) : dayScores(data.checkIns.get(d), habitsOn(data, d)));
  }
  return out;
}

export function summarize(scores: Map<Day, PillarScores>, range: Range) {
  const { scores: avg, daysWithData } = averageScores(daysIn(range).map((d) => scores.get(d) ?? pillarRecord(() => null)));
  return { scores: avg, daysWithData, overall: overallScore(avg) };
}

/** Días seguidos con check-in hasta hoy (si hoy aún no hay, cuenta desde ayer). */
export function checkInStreak(dates: Set<Day>, today: Day): number {
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export const pillarList = (scores: PillarScores, previous: PillarScores, daysWithData: Record<string, number>) =>
  PILLAR_IDS.map((id) => ({
    id,
    score: scores[id],
    previous: previous[id],
    delta: scores[id] !== null && previous[id] !== null ? (scores[id] as number) - (previous[id] as number) : null,
    daysWithData: daysWithData[id],
  }));

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
import type { CheckIn, Habit, HabitLog, PrismaClient } from '@prisma/client';
import { fromDb, toDb } from './util.js';

/** Datos de un rango de días, listos para puntuar. */
export interface DayData {
  checkIns: Map<Day, CheckIn>;
  habits: Array<Habit & { logs: HabitLog[] }>;
}

export async function loadDays(prisma: PrismaClient, userId: string, range: Range): Promise<DayData> {
  const [checkIns, habits] = await Promise.all([
    prisma.checkIn.findMany({ where: { userId, date: { gte: toDb(range.from), lte: toDb(range.to) } } }),
    prisma.habit.findMany({
      where: { userId, OR: [{ archivedAt: null }, { archivedAt: { gte: toDb(range.from) } }] },
      include: { logs: { where: { date: { gte: toDb(range.from), lte: toDb(range.to) } } } },
    }),
  ]);
  return { checkIns: new Map(checkIns.map((c) => [fromDb(c.date), c])), habits };
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

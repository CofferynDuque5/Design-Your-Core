import { addDays, daysIn, isDay, isPillarId, overallScore, periodRange, periodSchema, previousRange, recommend, todayIn, type PillarId } from '@dyc/core';
import { Router, type RequestHandler } from 'express';
import { upsert, type Db } from '../db/db.js';
import type { Dismissal } from '../db/types.js';
import { ah } from '../lib/http.js';
import { activeChallenges } from './challenges.js';
import { publicCheckIn } from './checkins.js';
import { findProfile } from './profile.js';
import { checkInStreak, habitsOn, loadDays, pillarList, scoreDays, summarize } from './insights.js';
import { fromDb, toDb } from './util.js';

const DISMISS_DAYS = 7;

async function recommendationsFor(db: Db, userId: string, today: string) {
  const [profile, dismissals, active] = await Promise.all([
    findProfile(db, userId),
    db.rows<Dismissal>('SELECT * FROM "Dismissal" WHERE "userId" = $1 AND "until" > $2', [userId, new Date()]),
    activeChallenges(db, userId, today),
  ]);
  const range = { from: addDays(today, -13), to: today };
  const data = await loadDays(db, userId, range);
  const week = { from: addDays(today, -6), to: today };
  const weekScores = summarize(scoreDays(data, daysIn(week), today), week).scores;
  return recommend({
    today,
    focusPillars: (profile?.focusPillars ?? []).filter(isPillarId) as PillarId[],
    checkIns: [...data.checkIns.entries()].map(([date, c]) => ({ ...c, date })),
    weekScores,
    activeChallenges: active.map((a) => ({ id: a.id, key: a.key, startedOn: a.startedOn, durationDays: a.durationDays, doneDays: a.doneDays })),
    dismissed: new Set(dismissals.map((d) => d.key)),
  });
}

export function dashboardRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();

  /**
   * Panel principal: ?period=day|week|month&date=AAAA-MM-DD (por defecto,
   * la semana de hoy). Devuelve la puntuación de cada pilar en el periodo,
   * la del periodo anterior, la serie diaria, hábitos, racha, retos activos,
   * el estado de hoy y las recomendaciones.
   */
  r.get('/dashboard', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const period = periodSchema.safeParse(req.query.period ?? 'week');
    if (!period.success) return res.status(400).json({ error: 'period debe ser day, week o month' });
    const profile = await findProfile(db, userId);
    const today = todayIn(profile?.timezone || 'UTC');
    const date = isDay(req.query.date) ? req.query.date : today;

    const range = periodRange(period.data, date);
    const prev = previousRange(period.data, range);
    const data = await loadDays(db, userId, { from: prev.from, to: range.to > today ? range.to : today });
    const scores = scoreDays(data, [...daysIn(prev), ...daysIn(range)], today);
    const current = summarize(scores, range);
    const previous = summarize(scores, prev);

    const pastDays = daysIn(range).filter((d) => d <= today);
    const scheduled = pastDays.flatMap((d) => habitsOn(data, d));
    const allCheckInDates = await db.rows<{ date: Date }>('SELECT "date" FROM "CheckIn" WHERE "userId" = $1 AND "date" BETWEEN $2 AND $3', [
      userId,
      toDb(addDays(today, -365)),
      toDb(today),
    ]);

    const todayCheckIn = data.checkIns.get(today);
    res.json({
      period: period.data,
      date,
      today,
      range,
      previousRange: prev,
      overall: { score: current.overall, previous: previous.overall },
      pillars: pillarList(current.scores, previous.scores, current.daysWithData),
      series: daysIn(range).map((d) => {
        const s = scores.get(d) ?? null;
        return { date: d, overall: s ? overallScore(s) : null, pillars: s };
      }),
      habits: { scheduled: scheduled.length, done: scheduled.filter((h) => h.done).length },
      checkIns: {
        count: pastDays.filter((d) => data.checkIns.has(d)).length,
        streak: checkInStreak(new Set(allCheckInDates.map((c) => fromDb(c.date))), today),
      },
      todayStatus: {
        checkIn: todayCheckIn ? publicCheckIn(todayCheckIn) : null,
        habits: habitsOn(data, today),
      },
      challenges: await activeChallenges(db, userId, today),
      recommendations: await recommendationsFor(db, userId, today),
      onboarded: !!profile?.onboardedAt,
    });
  }));

  r.get('/recommendations', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const profile = await findProfile(db, userId);
    res.json({ recommendations: await recommendationsFor(db, userId, todayIn(profile?.timezone || 'UTC')) });
  }));

  // Oculta una recomendación durante una semana.
  r.post('/recommendations/:key/dismiss', requireAuth, ah(async (req, res) => {
    const key = String(req.params.key);
    if (!/^[\w:-]{1,80}$/.test(key)) return res.status(400).json({ error: 'Clave no válida' });
    const userId = req.userId as string;
    const until = new Date(Date.now() + DISMISS_DAYS * 86_400_000);
    await upsert(db, 'Dismissal', ['userId', 'key'], { userId, key }, { until });
    res.json({ ok: true, until });
  }));

  return r;
}

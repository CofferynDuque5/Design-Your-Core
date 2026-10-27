import { addDays, habitInputSchema, habitPatchSchema, logInputSchema } from '@dyc/core';
import { Router, type RequestHandler } from 'express';
import { newId, upsert, type Db } from '../db/db.js';
import type { Habit, HabitLog } from '../db/types.js';
import { ah } from '../lib/http.js';
import { dayParam, fromDb, parse, toDb, userToday } from './util.js';

export const publicHabit = (h: Habit) => ({
  id: h.id,
  title: h.title,
  pillar: h.pillar,
  days: h.days,
  startsOn: fromDb(h.startsOn),
  archived: !!h.archivedAt,
  createdAt: h.createdAt,
});

export function habitRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();
  const own = (userId: string, id: string) => db.row<Habit>('SELECT * FROM "Habit" WHERE "id" = $1 AND "userId" = $2', [id, userId]);

  // Hábitos activos (?archived=1 incluye los archivados) con los registros de los últimos 7 días.
  r.get('/habits', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const today = await userToday(db, userId);
    const habits = await db.rows<Habit>(
      `SELECT * FROM "Habit" WHERE "userId" = $1 ${req.query.archived === '1' ? '' : 'AND "archivedAt" IS NULL'} ORDER BY "createdAt" ASC`,
      [userId],
    );
    const logs = await db.rows<HabitLog>('SELECT * FROM "HabitLog" WHERE "habitId" = ANY($1::text[]) AND "date" BETWEEN $2 AND $3', [
      habits.map((h) => h.id),
      toDb(addDays(today, -6)),
      toDb(today),
    ]);
    res.json({
      today,
      habits: habits.map((h) => ({
        ...publicHabit(h),
        recent: logs.filter((l) => l.habitId === h.id).map((l) => ({ date: fromDb(l.date), done: l.done })),
      })),
    });
  }));

  r.post('/habits', requireAuth, ah(async (req, res) => {
    const input = parse(habitInputSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const active = await db.row<{ n: number }>('SELECT count(*)::int AS n FROM "Habit" WHERE "userId" = $1 AND "archivedAt" IS NULL', [userId]);
    if ((active?.n ?? 0) >= 30) return res.status(409).json({ error: 'Tienes 30 hábitos activos. Archiva alguno antes de crear otro.' });
    const habit = (await db.row<Habit>(
      'INSERT INTO "Habit" ("id", "userId", "pillar", "title", "days", "startsOn", "createdAt") VALUES ($1, $2, $3, $4, COALESCE($5, \'1234567\'), $6, $7) RETURNING *',
      [newId(), userId, input.pillar, input.title, input.days ?? null, toDb(await userToday(db, userId)), new Date()],
    )) as Habit;
    res.status(201).json({ habit: publicHabit(habit) });
  }));

  r.patch('/habits/:id', requireAuth, ah(async (req, res) => {
    const input = parse(habitPatchSchema, req.body, res);
    if (!input) return;
    const habit = await own(req.userId as string, req.params.id);
    if (!habit) return res.status(404).json({ error: 'Hábito no encontrado' });
    const { archived, ...fields } = input;
    const next = { ...habit, ...fields, ...(archived === undefined ? {} : { archivedAt: archived ? habit.archivedAt ?? new Date() : null }) };
    const updated = (await db.row<Habit>(
      'UPDATE "Habit" SET "pillar" = $2, "title" = $3, "days" = $4, "archivedAt" = $5 WHERE "id" = $1 RETURNING *',
      [habit.id, next.pillar, next.title, next.days, next.archivedAt],
    )) as Habit;
    res.json({ habit: publicHabit(updated) });
  }));

  // Borra el hábito y su historial. Para conservar el historial, archívalo.
  r.delete('/habits/:id', requireAuth, ah(async (req, res) => {
    const habit = await own(req.userId as string, req.params.id);
    if (!habit) return res.status(404).json({ error: 'Hábito no encontrado' });
    await db.exec('DELETE FROM "Habit" WHERE "id" = $1', [habit.id]);
    res.json({ ok: true });
  }));

  r.put('/habits/:id/logs/:date', requireAuth, ah(async (req, res) => {
    const date = dayParam(req.params.date, res);
    if (!date) return;
    const input = parse(logInputSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const habit = await own(userId, req.params.id);
    if (!habit) return res.status(404).json({ error: 'Hábito no encontrado' });
    if (date > addDays(await userToday(db, userId), 1)) return res.status(400).json({ error: 'No se puede registrar un día futuro' });
    const log = await upsert<HabitLog>(db, 'HabitLog', ['habitId', 'date'], { habitId: habit.id, date: toDb(date) }, { done: input.done });
    res.json({ log: { habitId: habit.id, date, done: log.done } });
  }));

  return r;
}

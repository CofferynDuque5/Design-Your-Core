import { addDays, habitInputSchema, habitPatchSchema, logInputSchema } from '@dyc/core';
import type { Habit, PrismaClient } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
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

export function habitRoutes({ prisma, requireAuth }: { prisma: PrismaClient; requireAuth: RequestHandler }): Router {
  const r = Router();
  const own = (userId: string, id: string) => prisma.habit.findFirst({ where: { id, userId } });

  // Hábitos activos (?archived=1 incluye los archivados) con los registros de los últimos 7 días.
  r.get('/habits', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const today = await userToday(prisma, userId);
    const habits = await prisma.habit.findMany({
      where: { userId, ...(req.query.archived === '1' ? {} : { archivedAt: null }) },
      include: { logs: { where: { date: { gte: toDb(addDays(today, -6)), lte: toDb(today) } } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      today,
      habits: habits.map((h) => ({ ...publicHabit(h), recent: h.logs.map((l) => ({ date: fromDb(l.date), done: l.done })) })),
    });
  }));

  r.post('/habits', requireAuth, ah(async (req, res) => {
    const input = parse(habitInputSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const active = await prisma.habit.count({ where: { userId, archivedAt: null } });
    if (active >= 30) return res.status(409).json({ error: 'Tienes 30 hábitos activos. Archiva alguno antes de crear otro.' });
    const habit = await prisma.habit.create({ data: { ...input, userId, startsOn: toDb(await userToday(prisma, userId)) } });
    res.status(201).json({ habit: publicHabit(habit) });
  }));

  r.patch('/habits/:id', requireAuth, ah(async (req, res) => {
    const input = parse(habitPatchSchema, req.body, res);
    if (!input) return;
    const habit = await own(req.userId as string, req.params.id);
    if (!habit) return res.status(404).json({ error: 'Hábito no encontrado' });
    const { archived, ...fields } = input;
    const updated = await prisma.habit.update({
      where: { id: habit.id },
      data: { ...fields, ...(archived === undefined ? {} : { archivedAt: archived ? habit.archivedAt ?? new Date() : null }) },
    });
    res.json({ habit: publicHabit(updated) });
  }));

  // Borra el hábito y su historial. Para conservar el historial, archívalo.
  r.delete('/habits/:id', requireAuth, ah(async (req, res) => {
    const habit = await own(req.userId as string, req.params.id);
    if (!habit) return res.status(404).json({ error: 'Hábito no encontrado' });
    await prisma.habit.delete({ where: { id: habit.id } });
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
    if (date > addDays(await userToday(prisma, userId), 1)) return res.status(400).json({ error: 'No se puede registrar un día futuro' });
    const log = await prisma.habitLog.upsert({
      where: { habitId_date: { habitId: habit.id, date: toDb(date) } },
      update: { done: input.done },
      create: { habitId: habit.id, date: toDb(date), done: input.done },
    });
    res.json({ log: { habitId: habit.id, date, done: log.done } });
  }));

  return r;
}

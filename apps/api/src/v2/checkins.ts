import { addDays, checkInInputSchema, isDay, type Day } from '@dyc/core';
import type { CheckIn, PrismaClient } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
import { ah } from '../lib/http.js';
import { dayParam, fromDb, parse, toDb, userToday } from './util.js';

export function publicCheckIn(c: CheckIn) {
  const { id: _id, userId: _u, date, updatedAt, ...signals } = c;
  return { date: fromDb(date), ...signals, updatedAt };
}

const MAX_RANGE_DAYS = 366;

export function checkInRoutes({ prisma, requireAuth }: { prisma: PrismaClient; requireAuth: RequestHandler }): Router {
  const r = Router();

  // Lista por rango: ?from=AAAA-MM-DD&to=AAAA-MM-DD (por defecto, los últimos 30 días).
  r.get('/checkins', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const to: Day = isDay(req.query.to) ? req.query.to : await userToday(prisma, userId);
    const from: Day = isDay(req.query.from) ? req.query.from : addDays(to, -29);
    if (from > to || addDays(from, MAX_RANGE_DAYS) < to) return res.status(400).json({ error: 'Rango de fechas no válido (máximo un año)' });
    const rows = await prisma.checkIn.findMany({ where: { userId, date: { gte: toDb(from), lte: toDb(to) } }, orderBy: { date: 'asc' } });
    res.json({ from, to, checkIns: rows.map(publicCheckIn) });
  }));

  // Crea o completa el check-in del día. Los campos enviados se fusionan;
  // para borrar uno, envíalo como null.
  r.put('/checkins/:date', requireAuth, ah(async (req, res) => {
    const date = dayParam(req.params.date, res);
    if (!date) return;
    const userId = req.userId as string;
    if (date > addDays(await userToday(prisma, userId), 1)) return res.status(400).json({ error: 'No se puede registrar un día futuro' });
    const body = Object.fromEntries(Object.entries(req.body ?? {}).filter(([, v]) => v !== null));
    const nulls = Object.fromEntries(Object.entries(req.body ?? {}).filter(([, v]) => v === null).map(([k]) => [k, null]));
    const input = parse(checkInInputSchema, body, res);
    if (!input) return;
    const unknownNull = Object.keys(nulls).find((k) => !(k in checkInInputSchema.shape));
    if (unknownNull) return res.status(400).json({ error: `Campo desconocido: ${unknownNull}` });
    const data = { ...input, ...nulls };
    const saved = await prisma.checkIn.upsert({
      where: { userId_date: { userId, date: toDb(date) } },
      update: data,
      create: { ...input, userId, date: toDb(date) },
    });
    res.json({ checkIn: publicCheckIn(saved) });
  }));

  r.delete('/checkins/:date', requireAuth, ah(async (req, res) => {
    const date = dayParam(req.params.date, res);
    if (!date) return;
    await prisma.checkIn.deleteMany({ where: { userId: req.userId, date: toDb(date) } });
    res.json({ ok: true });
  }));

  return r;
}

import { addDays, checkInInputSchema, isDay, type Day } from '@dyc/core';
import { Router, type RequestHandler } from 'express';
import { newId, upsert, type Db } from '../db/db.js';
import type { CheckIn } from '../db/types.js';
import { ah } from '../lib/http.js';
import { dayParam, fromDb, parse, toDb, userToday } from './util.js';

export function publicCheckIn(c: CheckIn) {
  const { id: _id, userId: _u, date, updatedAt, ...signals } = c;
  return { date: fromDb(date), ...signals, updatedAt };
}

const MAX_RANGE_DAYS = 366;

export function checkInRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();

  // Lista por rango: ?from=AAAA-MM-DD&to=AAAA-MM-DD (por defecto, los últimos 30 días).
  r.get('/checkins', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const to: Day = isDay(req.query.to) ? req.query.to : await userToday(db, userId);
    const from: Day = isDay(req.query.from) ? req.query.from : addDays(to, -29);
    if (from > to || addDays(from, MAX_RANGE_DAYS) < to) return res.status(400).json({ error: 'Rango de fechas no válido (máximo un año)' });
    const rows = await db.rows<CheckIn>('SELECT * FROM "CheckIn" WHERE "userId" = $1 AND "date" BETWEEN $2 AND $3 ORDER BY "date" ASC', [userId, toDb(from), toDb(to)]);
    res.json({ from, to, checkIns: rows.map(publicCheckIn) });
  }));

  // Crea o completa el check-in del día. Los campos enviados se fusionan;
  // para borrar uno, envíalo como null.
  r.put('/checkins/:date', requireAuth, ah(async (req, res) => {
    const date = dayParam(req.params.date, res);
    if (!date) return;
    const userId = req.userId as string;
    if (date > addDays(await userToday(db, userId), 1)) return res.status(400).json({ error: 'No se puede registrar un día futuro' });
    const body = Object.fromEntries(Object.entries(req.body ?? {}).filter(([, v]) => v !== null));
    const nulls = Object.fromEntries(Object.entries(req.body ?? {}).filter(([, v]) => v === null).map(([k]) => [k, null]));
    const input = parse(checkInInputSchema, body, res);
    if (!input) return;
    const unknownNull = Object.keys(nulls).find((k) => !(k in checkInInputSchema.shape));
    if (unknownNull) return res.status(400).json({ error: `Campo desconocido: ${unknownNull}` });
    const data = { ...input, ...nulls, updatedAt: new Date() };
    const saved = await upsert<CheckIn>(db, 'CheckIn', ['userId', 'date'], { id: newId(), userId, date: toDb(date) }, data);
    res.json({ checkIn: publicCheckIn(saved) });
  }));

  r.delete('/checkins/:date', requireAuth, ah(async (req, res) => {
    const date = dayParam(req.params.date, res);
    if (!date) return;
    await db.exec('DELETE FROM "CheckIn" WHERE "userId" = $1 AND "date" = $2', [req.userId, toDb(date)]);
    res.json({ ok: true });
  }));

  return r;
}

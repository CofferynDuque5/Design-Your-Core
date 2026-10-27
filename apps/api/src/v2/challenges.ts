import { addDays, CHALLENGES, challengeByKey, challengePatchSchema, challengeStartSchema, diffDays, logInputSchema, type Day } from '@dyc/core';
import { Router, type RequestHandler } from 'express';
import { newId, upsert, type Db, type Sql } from '../db/db.js';
import type { ChallengeLog, UserChallenge } from '../db/types.js';
import { ah } from '../lib/http.js';
import { dayParam, fromDb, parse, toDb, userToday } from './util.js';

export const MAX_ACTIVE_CHALLENGES = 3;

type WithLogs = UserChallenge & { logs: ChallengeLog[] };

export function challengeProgress(c: WithLogs, today: Day) {
  const startedOn = fromDb(c.startedOn);
  const endsOn = addDays(startedOn, c.durationDays - 1);
  const dayNumber = Math.max(0, Math.min(diffDays(startedOn, today) + 1, c.durationDays));
  const doneDays = c.logs.filter((l) => l.done).length;
  const catalog = challengeByKey(c.challengeKey);
  return {
    id: c.id,
    key: c.challengeKey,
    pillar: c.pillar,
    title: catalog?.title ?? c.challengeKey,
    description: catalog?.description ?? '',
    level: catalog?.level ?? null,
    status: c.status,
    startedOn,
    endsOn,
    durationDays: c.durationDays,
    dayNumber,
    doneDays,
    doneToday: c.logs.some((l) => l.done && fromDb(l.date) === today),
    log: c.logs.map((l) => ({ date: fromDb(l.date), done: l.done })).sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

/** Marca como completados los retos activos cuyo plazo ya terminó. */
/** Añade a cada reto sus registros diarios. */
export async function withLogs(sql: Sql, rows: UserChallenge[]): Promise<WithLogs[]> {
  if (!rows.length) return [];
  const logs = await sql.rows<ChallengeLog>('SELECT * FROM "ChallengeLog" WHERE "userChallengeId" = ANY($1::text[])', [rows.map((c) => c.id)]);
  return rows.map((c) => ({ ...c, logs: logs.filter((l) => l.userChallengeId === c.id) }));
}

const activeRows = (db: Db, userId: string) =>
  db.rows<UserChallenge>('SELECT * FROM "UserChallenge" WHERE "userId" = $1 AND "status" = \'active\' ORDER BY "startedOn" ASC, "createdAt" ASC', [userId]);

export async function settleChallenges(db: Db, userId: string, today: Day): Promise<void> {
  const active = await activeRows(db, userId);
  const finished = active.filter((c) => addDays(fromDb(c.startedOn), c.durationDays - 1) < today);
  if (finished.length) {
    await db.exec('UPDATE "UserChallenge" SET "status" = \'completed\', "endedAt" = $2 WHERE "id" = ANY($1::text[])', [finished.map((c) => c.id), new Date()]);
  }
}

export async function activeChallenges(db: Db, userId: string, today: Day) {
  await settleChallenges(db, userId, today);
  const rows = await withLogs(db, await activeRows(db, userId));
  return rows.map((c) => challengeProgress(c, today));
}

export function challengeRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const findOwn = (id: string, userId: string) => db.row<UserChallenge>('SELECT * FROM "UserChallenge" WHERE "id" = $1 AND "userId" = $2', [id, userId]);
  const r = Router();

  r.get('/challenges/catalog', requireAuth, (_req, res) => {
    res.json({ challenges: CHALLENGES });
  });

  // Retos activos y los terminados en los últimos 60 días.
  r.get('/challenges', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const today = await userToday(db, userId);
    const active = await activeChallenges(db, userId, today);
    const past = await withLogs(
      db,
      await db.rows<UserChallenge>(
        'SELECT * FROM "UserChallenge" WHERE "userId" = $1 AND "status" <> \'active\' AND "startedOn" >= $2 ORDER BY "startedOn" DESC, "createdAt" DESC',
        [userId, toDb(addDays(today, -60))],
      ),
    );
    res.json({ today, active, past: past.map((c) => challengeProgress(c, today)) });
  }));

  // Acepta un reto del catálogo. Con `replaces` cambia un reto activo por otro (subir o bajar de nivel).
  r.post('/challenges', requireAuth, ah(async (req, res) => {
    const input = parse(challengeStartSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const catalog = challengeByKey(input.key);
    if (!catalog) return res.status(404).json({ error: 'Ese reto no existe' });
    const today = await userToday(db, userId);
    await settleChallenges(db, userId, today);
    const startOn = input.startOn ?? today;
    if (startOn < addDays(today, -1) || startOn > addDays(today, 7)) return res.status(400).json({ error: 'El reto debe empezar entre ayer y dentro de una semana' });

    const active = await activeRows(db, userId);
    const replaced = input.replaces ? active.find((c) => c.id === input.replaces) : undefined;
    if (input.replaces && !replaced) return res.status(404).json({ error: 'El reto a reemplazar no está activo' });
    if (active.some((c) => c.challengeKey === catalog.key && c.id !== replaced?.id)) return res.status(409).json({ error: 'Ya tienes este reto activo' });
    if (!replaced && active.length >= MAX_ACTIVE_CHALLENGES) {
      return res.status(409).json({ error: `Puedes tener hasta ${MAX_ACTIVE_CHALLENGES} retos a la vez. Termina o deja uno antes de empezar otro.` });
    }

    const created = await db.tx(async (tx) => {
      if (replaced) await tx.exec('UPDATE "UserChallenge" SET "status" = \'abandoned\', "endedAt" = $2 WHERE "id" = $1', [replaced.id, new Date()]);
      return (await tx.row<UserChallenge>(
        `INSERT INTO "UserChallenge" ("id", "userId", "challengeKey", "pillar", "startedOn", "durationDays", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [newId(), userId, catalog.key, catalog.pillar, toDb(startOn), catalog.durationDays, new Date()],
      )) as UserChallenge;
    });
    res.status(201).json({ challenge: challengeProgress({ ...created, logs: [] }, today) });
  }));

  r.patch('/challenges/:id', requireAuth, ah(async (req, res) => {
    const input = parse(challengePatchSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const c = await findOwn(req.params.id, userId);
    if (!c) return res.status(404).json({ error: 'Reto no encontrado' });
    const updated = (await db.row<UserChallenge>('UPDATE "UserChallenge" SET "status" = $2, "endedAt" = $3 WHERE "id" = $1 RETURNING *', [c.id, input.status, new Date()])) as UserChallenge;
    const [withLog] = await withLogs(db, [updated]);
    res.json({ challenge: challengeProgress(withLog, await userToday(db, userId)) });
  }));

  r.put('/challenges/:id/logs/:date', requireAuth, ah(async (req, res) => {
    const date = dayParam(req.params.date, res);
    if (!date) return;
    const input = parse(logInputSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const c = await findOwn(req.params.id, userId);
    if (!c) return res.status(404).json({ error: 'Reto no encontrado' });
    const today = await userToday(db, userId);
    const startedOn = fromDb(c.startedOn);
    if (date < startedOn || date > addDays(startedOn, c.durationDays - 1) || date > addDays(today, 1)) {
      return res.status(400).json({ error: 'Ese día está fuera del reto' });
    }
    await upsert(db, 'ChallengeLog', ['userChallengeId', 'date'], { userChallengeId: c.id, date: toDb(date) }, { done: input.done });
    const [fresh] = await withLogs(db, [c]);
    res.json({ challenge: challengeProgress(fresh, today) });
  }));

  return r;
}

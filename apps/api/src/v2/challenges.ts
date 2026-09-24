import { addDays, CHALLENGES, challengeByKey, challengePatchSchema, challengeStartSchema, diffDays, logInputSchema, type Day } from '@dyc/core';
import type { ChallengeLog, PrismaClient, UserChallenge } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
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
export async function settleChallenges(prisma: PrismaClient, userId: string, today: Day): Promise<void> {
  const active = await prisma.userChallenge.findMany({ where: { userId, status: 'active' } });
  const finished = active.filter((c) => addDays(fromDb(c.startedOn), c.durationDays - 1) < today);
  if (finished.length) {
    await prisma.userChallenge.updateMany({ where: { id: { in: finished.map((c) => c.id) } }, data: { status: 'completed', endedAt: new Date() } });
  }
}

export async function activeChallenges(prisma: PrismaClient, userId: string, today: Day) {
  await settleChallenges(prisma, userId, today);
  const rows = await prisma.userChallenge.findMany({ where: { userId, status: 'active' }, include: { logs: true }, orderBy: { startedOn: 'asc' } });
  return rows.map((c) => challengeProgress(c, today));
}

export function challengeRoutes({ prisma, requireAuth }: { prisma: PrismaClient; requireAuth: RequestHandler }): Router {
  const r = Router();

  r.get('/challenges/catalog', requireAuth, (_req, res) => {
    res.json({ challenges: CHALLENGES });
  });

  // Retos activos y los terminados en los últimos 60 días.
  r.get('/challenges', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const today = await userToday(prisma, userId);
    const active = await activeChallenges(prisma, userId, today);
    const past = await prisma.userChallenge.findMany({
      where: { userId, status: { not: 'active' }, startedOn: { gte: toDb(addDays(today, -60)) } },
      include: { logs: true },
      orderBy: { startedOn: 'desc' },
    });
    res.json({ today, active, past: past.map((c) => challengeProgress(c, today)) });
  }));

  // Acepta un reto del catálogo. Con `replaces` cambia un reto activo por otro (subir o bajar de nivel).
  r.post('/challenges', requireAuth, ah(async (req, res) => {
    const input = parse(challengeStartSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const catalog = challengeByKey(input.key);
    if (!catalog) return res.status(404).json({ error: 'Ese reto no existe' });
    const today = await userToday(prisma, userId);
    await settleChallenges(prisma, userId, today);
    const startOn = input.startOn ?? today;
    if (startOn < addDays(today, -1) || startOn > addDays(today, 7)) return res.status(400).json({ error: 'El reto debe empezar entre ayer y dentro de una semana' });

    const active = await prisma.userChallenge.findMany({ where: { userId, status: 'active' } });
    const replaced = input.replaces ? active.find((c) => c.id === input.replaces) : undefined;
    if (input.replaces && !replaced) return res.status(404).json({ error: 'El reto a reemplazar no está activo' });
    if (active.some((c) => c.challengeKey === catalog.key && c.id !== replaced?.id)) return res.status(409).json({ error: 'Ya tienes este reto activo' });
    if (!replaced && active.length >= MAX_ACTIVE_CHALLENGES) {
      return res.status(409).json({ error: `Puedes tener hasta ${MAX_ACTIVE_CHALLENGES} retos a la vez. Termina o deja uno antes de empezar otro.` });
    }

    const created = await prisma.$transaction(async (tx) => {
      if (replaced) await tx.userChallenge.update({ where: { id: replaced.id }, data: { status: 'abandoned', endedAt: new Date() } });
      return tx.userChallenge.create({
        data: { userId, challengeKey: catalog.key, pillar: catalog.pillar, startedOn: toDb(startOn), durationDays: catalog.durationDays },
        include: { logs: true },
      });
    });
    res.status(201).json({ challenge: challengeProgress(created, today) });
  }));

  r.patch('/challenges/:id', requireAuth, ah(async (req, res) => {
    const input = parse(challengePatchSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const c = await prisma.userChallenge.findFirst({ where: { id: req.params.id, userId } });
    if (!c) return res.status(404).json({ error: 'Reto no encontrado' });
    const updated = await prisma.userChallenge.update({ where: { id: c.id }, data: { status: input.status, endedAt: new Date() }, include: { logs: true } });
    res.json({ challenge: challengeProgress(updated, await userToday(prisma, userId)) });
  }));

  r.put('/challenges/:id/logs/:date', requireAuth, ah(async (req, res) => {
    const date = dayParam(req.params.date, res);
    if (!date) return;
    const input = parse(logInputSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const c = await prisma.userChallenge.findFirst({ where: { id: req.params.id, userId }, include: { logs: true } });
    if (!c) return res.status(404).json({ error: 'Reto no encontrado' });
    const today = await userToday(prisma, userId);
    const startedOn = fromDb(c.startedOn);
    if (date < startedOn || date > addDays(startedOn, c.durationDays - 1) || date > addDays(today, 1)) {
      return res.status(400).json({ error: 'Ese día está fuera del reto' });
    }
    await prisma.challengeLog.upsert({
      where: { userChallengeId_date: { userChallengeId: c.id, date: toDb(date) } },
      update: { done: input.done },
      create: { userChallengeId: c.id, date: toDb(date), done: input.done },
    });
    const fresh = await prisma.userChallenge.findUniqueOrThrow({ where: { id: c.id }, include: { logs: true } });
    res.json({ challenge: challengeProgress(fresh, today) });
  }));

  return r;
}

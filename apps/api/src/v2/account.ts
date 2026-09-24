import { accountDeleteSchema } from '@dyc/core';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Router, type RequestHandler } from 'express';
import { ah } from '../lib/http.js';
import { publicUser } from '../routes/auth.js';
import { challengeProgress } from './challenges.js';
import { publicCheckIn } from './checkins.js';
import { publicHabit } from './habits.js';
import { publicProfile } from './profile.js';
import { fromDb, parse, userToday } from './util.js';

export function accountRoutes({ prisma, requireAuth, strict }: { prisma: PrismaClient; requireAuth: RequestHandler; strict: RequestHandler }): Router {
  const r = Router();

  // Descarga de todos los datos de la persona (portabilidad).
  r.get('/account/export', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        blob: true,
        checkIns: { orderBy: { date: 'asc' } },
        habits: { include: { logs: { orderBy: { date: 'asc' } } } },
        challenges: { include: { logs: true } },
      },
    });
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    const today = await userToday(prisma, userId);
    res.setHeader('Content-Disposition', 'attachment; filename="design-your-core.json"');
    res.json({
      exportedAt: new Date(),
      user: publicUser(user),
      profile: publicProfile(user.profile),
      checkIns: user.checkIns.map(publicCheckIn),
      habits: user.habits.map((h) => ({ ...publicHabit(h), logs: h.logs.map((l) => ({ date: fromDb(l.date), done: l.done })) })),
      challenges: user.challenges.map((c) => challengeProgress(c, today)),
      legacy: user.blob?.data ?? {},
    });
  }));

  // Borra la cuenta y todos sus datos. Pide la contraseña para confirmar.
  r.delete('/account', requireAuth, strict, ah(async (req, res) => {
    const input = parse(accountDeleteSchema, req.body, res);
    if (!input) return;
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    if (!(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'La contraseña no es correcta' });
    await prisma.$transaction([
      prisma.user.updateMany({ where: { partnerId: user.id }, data: { partnerId: null } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);
    res.json({ ok: true });
  }));

  return r;
}

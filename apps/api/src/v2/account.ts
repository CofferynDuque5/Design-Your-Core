import { accountDeleteSchema } from '@dyc/core';
import bcrypt from 'bcryptjs';
import { Router, type RequestHandler } from 'express';
import type { Db } from '../db/db.js';
import type { ChallengeLog, CheckIn, Habit, HabitLog, UserChallenge } from '../db/types.js';
import { ah } from '../lib/http.js';
import { findUser, publicUser } from '../routes/auth.js';
import { findBlob } from '../routes/sync.js';
import { challengeProgress } from './challenges.js';
import { publicCheckIn } from './checkins.js';
import { publicHabit } from './habits.js';
import { findProfile, publicProfile } from './profile.js';
import { fromDb, parse, userToday } from './util.js';

export function accountRoutes({ db, requireAuth, strict }: { db: Db; requireAuth: RequestHandler; strict: RequestHandler }): Router {
  const r = Router();

  // Descarga de todos los datos de la persona (portabilidad).
  r.get('/account/export', requireAuth, ah(async (req, res) => {
    const userId = req.userId as string;
    const user = await findUser(db, userId);
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    const [profile, blob, checkIns, habits, habitLogs, challenges, challengeLogs] = await Promise.all([
      findProfile(db, userId),
      findBlob(db, userId),
      db.rows<CheckIn>('SELECT * FROM "CheckIn" WHERE "userId" = $1 ORDER BY "date" ASC', [userId]),
      db.rows<Habit>('SELECT * FROM "Habit" WHERE "userId" = $1 ORDER BY "createdAt" ASC', [userId]),
      db.rows<HabitLog>('SELECT l.* FROM "HabitLog" l JOIN "Habit" h ON h."id" = l."habitId" WHERE h."userId" = $1 ORDER BY l."date" ASC', [userId]),
      db.rows<UserChallenge>('SELECT * FROM "UserChallenge" WHERE "userId" = $1 ORDER BY "createdAt" ASC', [userId]),
      db.rows<ChallengeLog>('SELECT l.* FROM "ChallengeLog" l JOIN "UserChallenge" c ON c."id" = l."userChallengeId" WHERE c."userId" = $1', [userId]),
    ]);
    const today = await userToday(db, userId);
    res.setHeader('Content-Disposition', 'attachment; filename="design-your-core.json"');
    res.json({
      exportedAt: new Date(),
      user: publicUser(user),
      profile: publicProfile(profile),
      checkIns: checkIns.map(publicCheckIn),
      habits: habits.map((h) => ({
        ...publicHabit(h),
        logs: habitLogs.filter((l) => l.habitId === h.id).map((l) => ({ date: fromDb(l.date), done: l.done })),
      })),
      challenges: challenges.map((c) => challengeProgress({ ...c, logs: challengeLogs.filter((l) => l.userChallengeId === c.id) }, today)),
      legacy: blob?.data ?? {},
    });
  }));

  // Borra la cuenta y todos sus datos. Pide la contraseña para confirmar.
  r.delete('/account', requireAuth, strict, ah(async (req, res) => {
    const input = parse(accountDeleteSchema, req.body, res);
    if (!input) return;
    const user = await findUser(db, req.userId as string);
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    if (!(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'La contraseña no es correcta' });
    await db.tx(async (tx) => {
      await tx.exec('UPDATE "User" SET "partnerId" = NULL WHERE "partnerId" = $1', [user.id]);
      await tx.exec('DELETE FROM "User" WHERE "id" = $1', [user.id]);
    });
    res.json({ ok: true });
  }));

  return r;
}

import { isPillarId, profileInputSchema, userSettingsSchema, type PillarId } from '@dyc/core';
import { Router, type RequestHandler } from 'express';
import { upsert, type Db } from '../db/db.js';
import type { Profile, User } from '../db/types.js';
import { ah } from '../lib/http.js';
import { publicUser } from '../routes/auth.js';
import { parse } from './util.js';

export function publicProfile(p: Profile | null) {
  return {
    focusPillars: (p?.focusPillars ?? []).filter(isPillarId) as PillarId[],
    intention: p?.intention ?? null,
    energyLevel: p?.energyLevel ?? null,
    activityLevel: p?.activityLevel ?? null,
    wakeTime: p?.wakeTime ?? null,
    bedTime: p?.bedTime ?? null,
    timezone: p?.timezone ?? 'UTC',
    baseline: (p?.baseline as Record<string, number> | undefined) ?? {},
    onboarded: !!p?.onboardedAt,
    onboardedAt: p?.onboardedAt ?? null,
  };
}

export const findProfile = (db: Db, userId: string) => db.row<Profile>('SELECT * FROM "Profile" WHERE "userId" = $1', [userId]);

export function profileRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();

  r.get('/profile', requireAuth, ah(async (req, res) => {
    const p = await findProfile(db, req.userId as string);
    res.json({ profile: publicProfile(p) });
  }));

  // Guarda respuestas del onboarding (por pasos) o cambios de ajustes.
  r.put('/profile', requireAuth, ah(async (req, res) => {
    const input = parse(profileInputSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const { completeOnboarding, baseline, ...fields } = input;
    const current = await findProfile(db, userId);
    const data: Record<string, unknown> = { ...fields, updatedAt: new Date() };
    if (baseline) data.baseline = { ...((current?.baseline as object) ?? {}), ...baseline };
    if (completeOnboarding && !current?.onboardedAt) data.onboardedAt = new Date();
    const saved = await upsert<Profile>(db, 'Profile', ['userId'], { userId }, data, ['baseline']);
    res.json({ profile: publicProfile(saved) });
  }));

  // Ajustes de la cuenta. `showCycle` es el mismo que la app anterior recibe
  // en `user` al entrar, así que las dos apps muestran u ocultan Ciclo igual.
  r.patch('/me', requireAuth, ah(async (req, res) => {
    const input = parse(userSettingsSchema, req.body, res);
    if (!input) return;
    const user = await db.row<User>('UPDATE "User" SET "showCycle" = $2 WHERE "id" = $1 RETURNING *', [req.userId, input.showCycle]);
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    res.json({ user: publicUser(user) });
  }));

  return r;
}

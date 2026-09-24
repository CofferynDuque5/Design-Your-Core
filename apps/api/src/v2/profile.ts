import { isPillarId, profileInputSchema, type PillarId } from '@dyc/core';
import type { Prisma, PrismaClient, Profile } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
import { ah } from '../lib/http.js';
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

export function profileRoutes({ prisma, requireAuth }: { prisma: PrismaClient; requireAuth: RequestHandler }): Router {
  const r = Router();

  r.get('/profile', requireAuth, ah(async (req, res) => {
    const p = await prisma.profile.findUnique({ where: { userId: req.userId } });
    res.json({ profile: publicProfile(p) });
  }));

  // Guarda respuestas del onboarding (por pasos) o cambios de ajustes.
  r.put('/profile', requireAuth, ah(async (req, res) => {
    const input = parse(profileInputSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const { completeOnboarding, baseline, ...fields } = input;
    const current = await prisma.profile.findUnique({ where: { userId } });
    const data: Prisma.ProfileUncheckedUpdateInput = { ...fields };
    if (baseline) data.baseline = { ...((current?.baseline as object) ?? {}), ...baseline };
    if (completeOnboarding && !current?.onboardedAt) data.onboardedAt = new Date();
    const saved = await prisma.profile.upsert({
      where: { userId },
      update: data,
      create: { ...(data as Prisma.ProfileUncheckedCreateInput), userId },
    });
    res.json({ profile: publicProfile(saved) });
  }));

  return r;
}

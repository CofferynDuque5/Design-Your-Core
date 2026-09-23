import type { Prisma, PrismaClient } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
import { ah } from '../lib/http.js';

// Sincronización v1: el estado completo de la app como un único documento JSON.
export function syncRoutes({ prisma, requireAuth }: { prisma: PrismaClient; requireAuth: RequestHandler }): Router {
  const r = Router();

  r.get('/sync', requireAuth, ah(async (req, res) => {
    const blob = await prisma.blob.findUnique({ where: { userId: req.userId } });
    res.json({ data: blob?.data ?? {}, updatedAt: blob?.updatedAt ?? null });
  }));

  r.put('/sync', requireAuth, ah(async (req, res) => {
    const data = req.body?.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return res.status(400).json({ error: 'data debe ser un objeto' });
    const userId = req.userId as string;
    const saved = await prisma.blob.upsert({
      where: { userId },
      update: { data: data as Prisma.InputJsonObject },
      create: { userId, data: data as Prisma.InputJsonObject },
    });
    res.json({ ok: true, updatedAt: saved.updatedAt });
  }));

  return r;
}

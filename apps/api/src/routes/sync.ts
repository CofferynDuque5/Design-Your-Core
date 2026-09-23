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

  // Reemplaza el documento. Si el cliente envía `baseUpdatedAt` (el updatedAt
  // que leyó) y el documento cambió desde entonces en otro dispositivo, responde
  // 409 con la versión actual en lugar de pisarla. Sin `baseUpdatedAt` se
  // comporta como antes, para no romper la app publicada.
  r.put('/sync', requireAuth, ah(async (req, res) => {
    const data = req.body?.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return res.status(400).json({ error: 'data debe ser un objeto' });
    const userId = req.userId as string;
    const json = data as Prisma.InputJsonObject;

    const base = req.body?.baseUpdatedAt;
    if (base !== undefined && base !== null) {
      const baseDate = new Date(String(base));
      if (Number.isNaN(baseDate.getTime())) return res.status(400).json({ error: 'baseUpdatedAt no es una fecha válida' });
      const { count } = await prisma.blob.updateMany({ where: { userId, updatedAt: baseDate }, data: { data: json } });
      if (count === 0) {
        const current = await prisma.blob.findUnique({ where: { userId } });
        if (current) {
          return res.status(409).json({
            error: 'Tus datos cambiaron en otro dispositivo. Recarga para combinarlos antes de guardar.',
            data: current.data,
            updatedAt: current.updatedAt,
          });
        }
        const created = await prisma.blob.create({ data: { userId, data: json } });
        return res.json({ ok: true, updatedAt: created.updatedAt });
      }
      const saved = await prisma.blob.findUniqueOrThrow({ where: { userId } });
      return res.json({ ok: true, updatedAt: saved.updatedAt });
    }

    const saved = await prisma.blob.upsert({
      where: { userId },
      update: { data: json },
      create: { userId, data: json },
    });
    res.json({ ok: true, updatedAt: saved.updatedAt });
  }));

  return r;
}

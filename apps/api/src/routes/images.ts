import type { PrismaClient } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
import { ah } from '../lib/http.js';

export const MAX_IMG_BYTES = 4 * 1024 * 1024; // ~4MB por imagen (ya vienen reescaladas)
const IMAGE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

// Imágenes de los apuntes, sincronizadas entre dispositivos.
export function imageRoutes({ prisma, requireAuth }: { prisma: PrismaClient; requireAuth: RequestHandler }): Router {
  const r = Router();

  // Lista de ids de imágenes que el servidor tiene para este usuario.
  r.get('/images', requireAuth, ah(async (req, res) => {
    const rows = await prisma.image.findMany({ where: { userId: req.userId }, select: { id: true } });
    res.json({ ids: rows.map((row) => row.id) });
  }));

  // Sube (upsert) un lote de imágenes: { images: { id: dataURL } }.
  r.post('/images', requireAuth, ah(async (req, res) => {
    const images = req.body?.images;
    if (!images || typeof images !== 'object' || Array.isArray(images)) return res.status(400).json({ error: 'images debe ser un objeto' });
    const userId = req.userId as string;
    const entries = Object.entries(images as Record<string, unknown>).slice(0, 50);
    let count = 0;
    for (const [id, data] of entries) {
      if (!IMAGE_ID_RE.test(id)) continue;
      if (typeof data !== 'string' || !data.startsWith('data:') || data.length > MAX_IMG_BYTES) continue;
      // El id lo genera el cliente: nunca se sobrescribe una imagen de otra persona.
      const existing = await prisma.image.findUnique({ where: { id }, select: { userId: true } });
      if (existing && existing.userId !== userId) continue;
      await prisma.image.upsert({ where: { id }, update: { data }, create: { id, userId, data } });
      count++;
    }
    res.json({ ok: true, count });
  }));

  // Descarga imágenes por id: { ids: [...] } -> { images: { id: dataURL } }.
  r.post('/images/fetch', requireAuth, ah(async (req, res) => {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];
    const rows = await prisma.image.findMany({ where: { userId: req.userId, id: { in: ids } } });
    const out: Record<string, string> = {};
    for (const row of rows) out[row.id] = row.data;
    res.json({ images: out });
  }));

  return r;
}

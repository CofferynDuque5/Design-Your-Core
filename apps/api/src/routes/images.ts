import { Router, type RequestHandler } from 'express';
import type { Db } from '../db/db.js';
import { ah } from '../lib/http.js';

export const MAX_IMG_BYTES = 4 * 1024 * 1024; // ~4MB por imagen (ya vienen reescaladas)
const IMAGE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

// Imágenes de los apuntes, sincronizadas entre dispositivos.
export function imageRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();

  // Lista de ids de imágenes que el servidor tiene para este usuario.
  r.get('/images', requireAuth, ah(async (req, res) => {
    const rows = await db.rows<{ id: string }>('SELECT "id" FROM "Image" WHERE "userId" = $1', [req.userId]);
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
      // ON CONFLICT ... WHERE: si el id es de otra persona, no cambia nada.
      const changed = await db.exec(
        `INSERT INTO "Image" ("id", "userId", "data", "createdAt") VALUES ($1, $2, $3, $4)
         ON CONFLICT ("id") DO UPDATE SET "data" = EXCLUDED."data" WHERE "Image"."userId" = EXCLUDED."userId"`,
        [id, userId, data, new Date()],
      );
      if (changed) count++;
    }
    res.json({ ok: true, count });
  }));

  // Descarga imágenes por id: { ids: [...] } -> { images: { id: dataURL } }.
  r.post('/images/fetch', requireAuth, ah(async (req, res) => {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];
    const rows = await db.rows<{ id: string; data: string }>('SELECT "id", "data" FROM "Image" WHERE "userId" = $1 AND "id" = ANY($2::text[])', [req.userId, ids]);
    const out: Record<string, string> = {};
    for (const row of rows) out[row.id] = row.data;
    res.json({ images: out });
  }));

  return r;
}

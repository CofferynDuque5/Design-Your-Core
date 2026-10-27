import { Router, type RequestHandler } from 'express';
import type { Db } from '../db/db.js';
import type { Blob } from '../db/types.js';
import { ah } from '../lib/http.js';

export const findBlob = (db: Db, userId: string) => db.row<Blob>('SELECT * FROM "Blob" WHERE "userId" = $1', [userId]);

// Sincronización v1: el estado completo de la app como un único documento JSON.
export function syncRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();

  r.get('/sync', requireAuth, ah(async (req, res) => {
    const blob = await findBlob(db, req.userId as string);
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
    const json = JSON.stringify(data);

    const base = req.body?.baseUpdatedAt;
    if (base !== undefined && base !== null) {
      const baseDate = new Date(String(base));
      if (Number.isNaN(baseDate.getTime())) return res.status(400).json({ error: 'baseUpdatedAt no es una fecha válida' });
      const saved = await db.row<Blob>(
        'UPDATE "Blob" SET "data" = $2::jsonb, "updatedAt" = $3 WHERE "userId" = $1 AND "updatedAt" = $4 RETURNING "updatedAt"',
        [userId, json, new Date(), baseDate],
      );
      if (saved) return res.json({ ok: true, updatedAt: saved.updatedAt });
      const current = await findBlob(db, userId);
      if (current) {
        return res.status(409).json({
          error: 'Tus datos cambiaron en otro dispositivo. Recarga para combinarlos antes de guardar.',
          data: current.data,
          updatedAt: current.updatedAt,
        });
      }
      const created = await db.row<Blob>('INSERT INTO "Blob" ("userId", "data", "updatedAt") VALUES ($1, $2::jsonb, $3) RETURNING "updatedAt"', [userId, json, new Date()]);
      return res.json({ ok: true, updatedAt: created?.updatedAt });
    }

    const saved = await db.row<Blob>(
      `INSERT INTO "Blob" ("userId", "data", "updatedAt") VALUES ($1, $2::jsonb, $3)
       ON CONFLICT ("userId") DO UPDATE SET "data" = EXCLUDED."data", "updatedAt" = EXCLUDED."updatedAt" RETURNING "updatedAt"`,
      [userId, json, new Date()],
    );
    res.json({ ok: true, updatedAt: saved?.updatedAt });
  }));

  return r;
}

import { Router, type RequestHandler } from 'express';
import type { Db } from '../db/db.js';
import type { Blob } from '../db/types.js';
import { ah } from '../lib/http.js';
import { COURSES, readDoc, replaceCourses, withCourses } from '../db/courses.js';

export const findBlob = (db: Db, userId: string) => db.row<Blob>('SELECT * FROM "Blob" WHERE "userId" = $1', [userId]);
const readUpdatedAt = async (db: Db, userId: string) => (await db.row<{ updatedAt: Date }>('SELECT "updatedAt" FROM "Blob" WHERE "userId" = $1', [userId]))?.updatedAt ?? null;

// Sincronización v1: el estado completo de la app como un único documento JSON.
export function syncRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();

  r.get('/sync', requireAuth, ah(async (req, res) => {
    const doc = await readDoc(db, req.userId as string);
    res.json({ data: doc?.data ?? {}, updatedAt: doc?.updatedAt ?? null });
  }));

  // Reemplaza el documento. Si el cliente envía `baseUpdatedAt` (el updatedAt
  // que leyó) y el documento cambió desde entonces en otro dispositivo, responde
  // 409 con la versión actual en lugar de pisarla. Sin `baseUpdatedAt` se
  // comporta como antes, para no romper la app publicada.
  r.put('/sync', requireAuth, ah(async (req, res) => {
    const data = req.body?.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return res.status(400).json({ error: 'data debe ser un objeto' });
    const userId = req.userId as string;
    // Los cursos se guardan en su tabla ("CourseItem"); el resto, en "Blob". Si
    // el documento no trae `courses`, los cursos guardados se conservan.
    const { [COURSES]: courses, ...rest } = data as Record<string, unknown>;
    if (courses !== undefined && !Array.isArray(courses)) rest[COURSES] = courses;
    const json = JSON.stringify(rest);
    const saveCourses = async () => {
      if (!Array.isArray(courses)) return;
      await withCourses(db, userId, async (t) => {
        await replaceCourses(t, courses);
        return { result: null };
      });
    };

    const base = req.body?.baseUpdatedAt;
    if (base !== undefined && base !== null) {
      const baseDate = new Date(String(base));
      if (Number.isNaN(baseDate.getTime())) return res.status(400).json({ error: 'baseUpdatedAt no es una fecha válida' });
      const saved = await db.row<Blob>(
        'UPDATE "Blob" SET "data" = $2::jsonb, "updatedAt" = $3 WHERE "userId" = $1 AND "updatedAt" = $4 RETURNING "updatedAt"',
        [userId, json, new Date(), baseDate],
      );
      if (saved) {
        await saveCourses();
        return res.json({ ok: true, updatedAt: (await readUpdatedAt(db, userId)) ?? saved.updatedAt });
      }
      const current = await readDoc(db, userId);
      if (current) {
        return res.status(409).json({
          error: 'Tus datos cambiaron en otro dispositivo. Recarga para combinarlos antes de guardar.',
          data: current.data,
          updatedAt: current.updatedAt,
        });
      }
      const created = await db.row<Blob>('INSERT INTO "Blob" ("userId", "data", "updatedAt") VALUES ($1, $2::jsonb, $3) RETURNING "updatedAt"', [userId, json, new Date()]);
      await saveCourses();
      return res.json({ ok: true, updatedAt: (await readUpdatedAt(db, userId)) ?? created?.updatedAt });
    }

    const saved = await db.row<Blob>(
      `INSERT INTO "Blob" ("userId", "data", "updatedAt") VALUES ($1, $2::jsonb, $3)
       ON CONFLICT ("userId") DO UPDATE SET "data" = EXCLUDED."data", "updatedAt" = EXCLUDED."updatedAt" RETURNING "updatedAt"`,
      [userId, json, new Date()],
    );
    await saveCourses();
    res.json({ ok: true, updatedAt: (await readUpdatedAt(db, userId)) ?? saved?.updatedAt });
  }));

  return r;
}

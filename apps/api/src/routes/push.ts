import { ALARM_MAX } from '@dyc/core';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Db } from '../db/db.js';
import { ah } from '../lib/http.js';
import { vapidKeys } from '../lib/webPush.js';

const subscription = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith('https://'), 'endpoint debe ser https'),
  keys: z.object({ p256dh: z.string().min(10).max(400), auth: z.string().min(4).max(200) }),
});

const alarm = z.object({
  id: z.string().min(1).max(200),
  at: z.string().datetime(),
  title: z.string().min(1).max(200),
  body: z.string().max(400).default(''),
  url: z.string().max(400).regex(/^\/(?!\/)/, 'url debe ser una ruta del panel').default('/'),
});
const alarms = z.array(alarm).max(ALARM_MAX);

/**
 * Avisos del panel web aunque esté cerrado. El navegador se suscribe y el
 * panel sube sus próximas alarmas (con la hora de quien lo usa); el servidor
 * las envía a su hora (lib/webPush.ts).
 */
export function pushRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();

  r.get('/push/key', ah(async (_req, res) => {
    res.json({ publicKey: (await vapidKeys(db)).publicKey });
  }));

  /** Guarda (o renueva) la suscripción de este navegador. */
  r.post('/push/subscription', requireAuth, ah(async (req, res) => {
    const parsed = subscription.safeParse(req.body?.subscription);
    if (!parsed.success) return res.status(400).json({ error: 'Suscripción no válida' });
    const s = parsed.data;
    await db.exec(
      `INSERT INTO "WebPushSubscription" ("endpoint", "userId", "p256dh", "auth", "updatedAt") VALUES ($1, $2, $3, $4, now())
       ON CONFLICT ("endpoint") DO UPDATE SET "userId" = EXCLUDED."userId", "p256dh" = EXCLUDED."p256dh", "auth" = EXCLUDED."auth", "updatedAt" = now()`,
      [s.endpoint, req.userId, s.keys.p256dh, s.keys.auth],
    );
    res.json({ ok: true });
  }));

  r.delete('/push/subscription', requireAuth, ah(async (req, res) => {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    await db.exec('DELETE FROM "WebPushSubscription" WHERE "endpoint" = $1 AND "userId" = $2', [endpoint, req.userId]);
    res.json({ ok: true });
  }));

  /** Sustituye las alarmas pendientes de esta persona por las que manda el panel. */
  r.put('/push/alarms', requireAuth, ah(async (req, res) => {
    const parsed = alarms.safeParse(req.body?.alarms);
    if (!parsed.success) return res.status(400).json({ error: 'Alarmas no válidas' });
    const userId = req.userId as string;
    const list = parsed.data.filter((a) => Date.parse(a.at) > Date.now());
    await db.tx(async (tx) => {
      await tx.exec('DELETE FROM "WebPushAlarm" WHERE "userId" = $1 AND "sentAt" IS NULL', [userId]);
      for (const a of list) {
        await tx.exec(
          `INSERT INTO "WebPushAlarm" ("userId", "id", "at", "title", "body", "url") VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT ("userId", "id") DO NOTHING`,
          [userId, a.id, new Date(a.at), a.title, a.body, a.url],
        );
      }
    });
    res.json({ ok: true, count: list.length });
  }));

  return r;
}

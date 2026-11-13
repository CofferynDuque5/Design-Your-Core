import { CONTACT_EMAIL } from '@dyc/core';
import webpush from 'web-push';
import type { Db } from '../db/db.js';

/**
 * Avisos del panel web aunque esté cerrado (Web Push). Las claves VAPID se
 * crean solas la primera vez y se guardan en la base: no hay nada que
 * configurar en el servidor. Si existen VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY,
 * se usan esas.
 */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cached: VapidKeys | null = null;

export async function vapidKeys(db: Db): Promise<VapidKeys> {
  if (cached) return cached;
  const fromEnv = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : null;
  if (fromEnv) return (cached = fromEnv);
  const row = await db.row<VapidKeys>('SELECT "publicKey", "privateKey" FROM "WebPushKey" WHERE "id" = $1', ['vapid']);
  if (row) return (cached = row);
  const fresh = webpush.generateVAPIDKeys();
  // Dos procesos a la vez: gana el primero y los dos usan la misma.
  await db.exec('INSERT INTO "WebPushKey" ("id", "publicKey", "privateKey") VALUES ($1, $2, $3) ON CONFLICT ("id") DO NOTHING', ['vapid', fresh.publicKey, fresh.privateKey]);
  const saved = await db.row<VapidKeys>('SELECT "publicKey", "privateKey" FROM "WebPushKey" WHERE "id" = $1', ['vapid']);
  return (cached = saved ?? fresh);
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Envía un aviso a un navegador. Devuelve false si la suscripción ya no existe (hay que borrarla). */
export type PushSender = (sub: PushSubscriptionRow, payload: PushPayload, keys: VapidKeys) => Promise<boolean>;

export const sendWebPush: PushSender = async (sub, payload, keys) => {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      vapidDetails: { subject: `mailto:${CONTACT_EMAIL}`, publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 60 * 30,
      urgency: 'high',
    });
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return false;
    throw e;
  }
};

/** Una alarma que llega tarde más de esto ya no se envía (el servidor estuvo apagado). */
const LATE_MS = 15 * 60_000;

/**
 * Envía las alarmas que ya tocan. Cada una se marca como enviada antes de
 * mandarla (UPDATE … RETURNING), así dos procesos nunca la envían dos veces.
 */
export async function sendDueAlarms(db: Db, send: PushSender = sendWebPush, now = new Date()): Promise<number> {
  const due = await db.rows<{ userId: string; id: string; title: string; body: string; url: string }>(
    `UPDATE "WebPushAlarm" SET "sentAt" = $1
     WHERE ("userId", "id") IN (
       SELECT "userId", "id" FROM "WebPushAlarm" WHERE "sentAt" IS NULL AND "at" <= $1 AND "at" > $2 ORDER BY "at" LIMIT 500
     )
     RETURNING "userId", "id", "title", "body", "url"`,
    [now, new Date(now.getTime() - LATE_MS)],
  );
  if (!due.length) return 0;
  const keys = await vapidKeys(db);
  let sent = 0;
  for (const a of due) {
    const subs = await db.rows<PushSubscriptionRow>('SELECT "endpoint", "p256dh", "auth" FROM "WebPushSubscription" WHERE "userId" = $1', [a.userId]);
    for (const s of subs) {
      try {
        const ok = await send(s, { title: a.title, body: a.body, url: a.url, tag: a.id }, keys);
        if (ok) sent++;
        else await db.exec('DELETE FROM "WebPushSubscription" WHERE "endpoint" = $1', [s.endpoint]);
      } catch (e) {
        console.error('[core-cloud] aviso web no enviado:', e instanceof Error ? e.message : e);
      }
    }
  }
  // Limpieza: lo enviado o vencido hace más de un día.
  await db.exec('DELETE FROM "WebPushAlarm" WHERE "at" < $1', [new Date(now.getTime() - 86_400_000)]);
  return sent;
}

/** Revisa cada 30 segundos si hay alarmas que enviar. */
export function startAlarmScheduler(db: Db, send: PushSender = sendWebPush): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sendDueAlarms(db, send);
    } catch (e) {
      console.error('[core-cloud] alarmas web:', e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  const t = setInterval(() => void tick(), 30_000);
  t.unref();
  return () => clearInterval(t);
}

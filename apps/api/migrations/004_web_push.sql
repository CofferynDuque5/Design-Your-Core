-- Avisos del panel web aunque esté cerrado (Web Push): claves del servidor,
-- suscripciones de cada navegador y alarmas programadas por persona.

CREATE TABLE IF NOT EXISTS "WebPushKey" (
  "id" text PRIMARY KEY,
  "publicKey" text NOT NULL,
  "privateKey" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "WebPushSubscription" (
  "endpoint" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "WebPushSubscription_userId_idx" ON "WebPushSubscription" ("userId");

CREATE TABLE IF NOT EXISTS "WebPushAlarm" (
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "id" text NOT NULL,
  "at" timestamp(3) NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "url" text NOT NULL DEFAULT '/',
  "sentAt" timestamp(3),
  PRIMARY KEY ("userId", "id")
);

CREATE INDEX IF NOT EXISTS "WebPushAlarm_at_idx" ON "WebPushAlarm" ("at");

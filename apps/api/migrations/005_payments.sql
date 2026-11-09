-- Planes y pagos manuales: plan vigente de cada cuenta, ajustes de la pasarela
-- (precios y datos de cada método, los carga el administrador) y las
-- solicitudes de pago con su comprobante.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plan" text NOT NULL DEFAULT 'gratis';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planUntil" timestamp(3);

CREATE TABLE IF NOT EXISTS "AppSetting" (
  "key" text PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PaymentRequest" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "plan" text NOT NULL,
  "period" text NOT NULL,
  "methodId" text NOT NULL,
  "methodName" text NOT NULL,
  "currency" text NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "amountUsd" numeric(10, 2) NOT NULL,
  "reference" text NOT NULL,
  "payerName" text NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "proof" text,
  "status" text NOT NULL DEFAULT 'pendiente',
  "adminNote" text NOT NULL DEFAULT '',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "reviewedAt" timestamp(3)
);

CREATE INDEX IF NOT EXISTS "PaymentRequest_userId_idx" ON "PaymentRequest" ("userId");
CREATE INDEX IF NOT EXISTS "PaymentRequest_status_createdAt_idx" ON "PaymentRequest" ("status", "createdAt");

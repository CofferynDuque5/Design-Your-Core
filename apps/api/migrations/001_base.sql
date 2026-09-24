-- Tablas de la versión original (core-cloud). Idempotente: en producción ya existen.

CREATE TABLE IF NOT EXISTS "User" (
  "id" text PRIMARY KEY,
  "email" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "passwordHash" text NOT NULL,
  "inviteCode" text UNIQUE,
  "partnerId" text,
  "gender" text,
  "showCycle" boolean NOT NULL DEFAULT false,
  "tokenVersion" integer NOT NULL DEFAULT 0,
  "resetTokenHash" text UNIQUE,
  "resetExpires" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now() 
);

CREATE TABLE IF NOT EXISTS "Blob" (
  "userId" text PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "data" jsonb NOT NULL DEFAULT '{}',
  "updatedAt" timestamp(3) NOT NULL DEFAULT now() 
);

CREATE TABLE IF NOT EXISTS "Image" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "data" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now() 
);

CREATE INDEX IF NOT EXISTS "Image_userId_idx" ON "Image"("userId");

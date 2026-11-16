-- Personaje de la foto de perfil y espacio compartido de la pareja (fotos,
-- metas y emprendimientos en común). Lo compartido se guarda con la clave de
-- la pareja (los dos ids en orden), así sigue ahí si se vuelven a vincular.

ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "avatar" text;

CREATE TABLE IF NOT EXISTS "CoupleItem" (
  "id" text PRIMARY KEY,
  "pairKey" text NOT NULL,
  "kind" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}',
  "image" text,
  "thumb" text,
  "createdBy" text REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "CoupleItem_pairKey_kind_idx" ON "CoupleItem" ("pairKey", "kind");

-- Cursos en su propia tabla (una fila por curso).
--
-- Antes todos los cursos vivían dentro del documento JSON de "Blob" (clave
-- `courses`), así que cada cambio en un curso leía y reescribía el documento
-- entero (varios MB) y eso gastaba la transferencia de la base de datos.
--
-- Nada se pierde:
--  1. Se guarda una copia del documento tal como estaba en "BlobBackup".
--  2. Cada curso pasa a "CourseItem" con todos sus campos y en el mismo orden.
--  3. Solo después se quita `courses` del documento.
-- Si `courses` no es una lista, no se toca.

ALTER TABLE "Blob" ADD COLUMN IF NOT EXISTS "coursesRev" bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "BlobBackup" (
  "id" bigserial PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "data" jsonb NOT NULL,
  "reason" text NOT NULL,
  "savedAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "BlobBackup_userId_idx" ON "BlobBackup" ("userId");

-- "key" es el id del curso (o "~N" si el elemento no tiene id o el id se repite),
-- "itemId" el id tal cual y "pos" el orden de la lista.
CREATE TABLE IF NOT EXISTS "CourseItem" (
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "key" text NOT NULL,
  "itemId" text,
  "pos" double precision NOT NULL,
  "data" jsonb NOT NULL,
  PRIMARY KEY ("userId", "key")
);

CREATE INDEX IF NOT EXISTS "CourseItem_userId_itemId_idx" ON "CourseItem" ("userId", "itemId");
CREATE INDEX IF NOT EXISTS "CourseItem_userId_pos_idx" ON "CourseItem" ("userId", "pos");

INSERT INTO "BlobBackup" ("userId", "data", "reason")
SELECT "userId", "data", '007: antes de mover los cursos a CourseItem'
  FROM "Blob"
 WHERE jsonb_typeof("data"->'courses') = 'array';

INSERT INTO "CourseItem" ("userId", "key", "itemId", "pos", "data")
SELECT x."userId",
       CASE WHEN x."itemId" IS NOT NULL AND x.n = 1 THEN x."itemId" ELSE '~' || x.o END,
       x."itemId",
       x.o * 1024,
       x.v
  FROM (
    SELECT b."userId", e.v, e.o,
           CASE WHEN jsonb_typeof(e.v->'id') = 'string' THEN e.v->>'id' END AS "itemId",
           row_number() OVER (PARTITION BY b."userId", CASE WHEN jsonb_typeof(e.v->'id') = 'string' THEN e.v->>'id' END ORDER BY e.o) AS n
      FROM "Blob" b, jsonb_array_elements(b."data"->'courses') WITH ORDINALITY AS e(v, o)
     WHERE jsonb_typeof(b."data"->'courses') = 'array'
  ) x
ON CONFLICT ("userId", "key") DO NOTHING;

UPDATE "Blob"
   SET "data" = "data" - 'courses', "coursesRev" = "coursesRev" + 1
 WHERE jsonb_typeof("data"->'courses') = 'array';

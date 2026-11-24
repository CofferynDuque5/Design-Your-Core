import type { Db, Sql } from './db.js';

// Cursos en su propia tabla ("CourseItem", una fila por curso).
//
// La app sigue viendo un solo documento JSON con la clave `courses`: aquí se
// arma ese documento juntando "Blob" (todo lo demás) con los cursos. Cambiar un
// curso solo lee y escribe esa fila, no el documento entero.
//
// "Blob"."coursesRev" sube con cada cambio en los cursos: sirve de candado (se
// bloquea la fila de "Blob", sin leer sus datos) y de versión para la caché en
// memoria, que evita volver a pedir a la base todos los cursos en cada lectura.

export const COURSES = 'courses';

type Doc = Record<string, unknown>;
export interface CourseRow {
  key: string;
  itemId: string | null;
  pos: number;
  data: unknown;
}

// ---------- Caché en memoria (por proceso) ----------

const CACHE_MAX = 5;
const cache = new Map<string, { rev: string; rows: CourseRow[] }>();

const remember = (userId: string, rev: string, rows: CourseRow[]) => {
  cache.delete(userId);
  cache.set(userId, { rev, rows });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
};

/** Para las pruebas. */
export const clearCoursesCache = () => cache.clear();

const sortRows = (rows: CourseRow[]) => rows.sort((a, b) => a.pos - b.pos || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

// ---------- Mudanza (cursos que aún estén dentro del documento) ----------

/**
 * Si el documento de la persona todavía tiene `courses` como lista (datos
 * copiados de otra base, o una app antigua que reemplazó el documento), los
 * pasa a "CourseItem". Todo ocurre dentro de la base: no se transfieren datos.
 * Debe llamarse con la fila de "Blob" bloqueada.
 */
export async function moveCoursesOut(sql: Sql, userId: string): Promise<boolean> {
  const moved = await sql.exec(
    `INSERT INTO "BlobBackup" ("userId", "data", "reason")
     SELECT "userId", "data", 'cursos que seguían dentro del documento'
       FROM "Blob" WHERE "userId" = $1 AND jsonb_typeof("data"->'courses') = 'array'`,
    [userId],
  );
  if (!moved) return false;
  await sql.exec(
    `INSERT INTO "CourseItem" ("userId", "key", "itemId", "pos", "data")
     SELECT x."userId",
            CASE WHEN x."itemId" IS NOT NULL AND x.n = 1 THEN x."itemId" ELSE '~' || (x.base + x.o) END,
            x."itemId",
            (x.base + x.o) * 1024,
            x.v
       FROM (
         SELECT b."userId", e.v, e.o,
                COALESCE((SELECT max(c."pos") / 1024 FROM "CourseItem" c WHERE c."userId" = b."userId"), 0)::bigint AS base,
                CASE WHEN jsonb_typeof(e.v->'id') = 'string' THEN e.v->>'id' END AS "itemId",
                row_number() OVER (PARTITION BY CASE WHEN jsonb_typeof(e.v->'id') = 'string' THEN e.v->>'id' END ORDER BY e.o) AS n
           FROM "Blob" b, jsonb_array_elements(b."data"->'courses') WITH ORDINALITY AS e(v, o)
          WHERE b."userId" = $1 AND jsonb_typeof(b."data"->'courses') = 'array'
       ) x
     ON CONFLICT ("userId", "key") DO UPDATE SET "data" = EXCLUDED."data", "itemId" = EXCLUDED."itemId"`,
    [userId],
  );
  await sql.exec(`UPDATE "Blob" SET "data" = "data" - 'courses', "coursesRev" = "coursesRev" + 1 WHERE "userId" = $1`, [userId]);
  cache.delete(userId);
  return true;
}

// ---------- Lectura ----------

interface BlobHead {
  data: unknown;
  updatedAt: Date;
  coursesRev: string;
  legacy: boolean;
}

const headOf = (sql: Sql, userId: string) =>
  sql.row<BlobHead>(
    `SELECT "data", "updatedAt", "coursesRev"::text AS "coursesRev", jsonb_typeof("data"->'courses') = 'array' AS legacy FROM "Blob" WHERE "userId" = $1`,
    [userId],
  );

/** Los cursos en orden, desde la caché si la versión coincide. */
export async function loadCourses(sql: Sql, userId: string, rev: string): Promise<CourseRow[]> {
  const hit = cache.get(userId);
  if (hit && hit.rev === rev) return hit.rows;
  const rows = await sql.rows<CourseRow>('SELECT "key", "itemId", "pos", "data" FROM "CourseItem" WHERE "userId" = $1 ORDER BY "pos", "key"', [userId]);
  remember(userId, rev, rows);
  return rows;
}

/**
 * El documento completo de la persona (lo que antes era "Blob"."data"), con los
 * cursos dentro de `courses`. null si aún no tiene documento.
 */
export async function readDoc(db: Db, userId: string): Promise<{ data: Doc; updatedAt: Date } | null> {
  let head = await headOf(db, userId);
  if (!head) return null;
  if (head.legacy) {
    await db.tx(async (tx) => {
      await tx.exec('SELECT 1 FROM "Blob" WHERE "userId" = $1 FOR UPDATE', [userId]);
      await moveCoursesOut(tx, userId);
    });
    head = await headOf(db, userId);
    if (!head) return null;
  }
  const raw = head.data;
  const data: Doc = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Doc) } : {};
  const rows = await loadCourses(db, userId, head.coursesRev);
  if (rows.length) data[COURSES] = rows.map((r) => r.data);
  return { data, updatedAt: head.updatedAt };
}

// ---------- Escritura ----------

export interface CourseTx {
  sql: Sql;
  userId: string;
  rev: string;
}

/**
 * Bloquea la fila de "Blob" (creándola si falta) sin leer sus datos, mueve los
 * cursos que sigan dentro del documento y ejecuta `fn`. Al terminar sube la
 * versión y la hora del documento, y actualiza la caché con `patchCache`.
 */
export async function withCourses<T>(
  db: Db,
  userId: string,
  fn: (t: CourseTx) => Promise<{ result: T; patchCache?: (rows: CourseRow[]) => CourseRow[] | null }>,
): Promise<{ result: T; updatedAt: Date | null }> {
  return db.tx(async (sql) => {
    const lock = () => sql.row<{ rev: string; legacy: boolean }>(
      `SELECT "coursesRev"::text AS rev, jsonb_typeof("data"->'courses') = 'array' AS legacy FROM "Blob" WHERE "userId" = $1 FOR UPDATE`,
      [userId],
    );
    let head = await lock();
    if (!head) {
      await sql.exec('INSERT INTO "Blob" ("userId", "data", "updatedAt") VALUES ($1, \'{}\'::jsonb, $2) ON CONFLICT ("userId") DO NOTHING', [userId, new Date()]);
      head = await lock();
    }
    if (head?.legacy) {
      await moveCoursesOut(sql, userId);
      head = await lock();
    }
    const rev = head?.rev ?? '0';
    const { result, patchCache } = await fn({ sql, userId, rev });
    const saved = await sql.row<{ updatedAt: Date; rev: string }>(
      'UPDATE "Blob" SET "coursesRev" = "coursesRev" + 1, "updatedAt" = $2 WHERE "userId" = $1 RETURNING "updatedAt", "coursesRev"::text AS rev',
      [userId, new Date()],
    );
    // La caché solo se actualiza si estaba al día; si no, se descarta.
    const hit = cache.get(userId);
    const next = hit && hit.rev === rev && patchCache ? patchCache([...hit.rows]) : null;
    if (next && saved) remember(userId, saved.rev, sortRows(next));
    else cache.delete(userId);
    return { result, updatedAt: saved?.updatedAt ?? null };
  });
}

/** El primer curso con ese id (como `findIndex` en la lista), bloqueado. */
export const findCourse = (t: CourseTx, id: string) =>
  t.sql.row<CourseRow>('SELECT "key", "itemId", "pos", "data" FROM "CourseItem" WHERE "userId" = $1 AND "itemId" = $2 ORDER BY "pos", "key" LIMIT 1 FOR UPDATE', [t.userId, id]);

export const courseExists = async (t: CourseTx, id: string) =>
  !!(await t.sql.row('SELECT 1 FROM "CourseItem" WHERE "userId" = $1 AND "itemId" = $2 LIMIT 1', [t.userId, id]));

/** Añade un curso al final de la lista. */
export async function insertCourse(t: CourseTx, item: { id: string } & Doc): Promise<CourseRow> {
  const top = await t.sql.row<{ pos: number | null }>('SELECT max("pos") AS pos FROM "CourseItem" WHERE "userId" = $1', [t.userId]);
  const pos = Math.floor((top?.pos ?? 0) / 1024) * 1024 + 1024;
  const taken = await t.sql.row('SELECT 1 FROM "CourseItem" WHERE "userId" = $1 AND "key" = $2', [t.userId, item.id]);
  const key = taken ? `~${pos}-${item.id}` : item.id;
  await t.sql.exec('INSERT INTO "CourseItem" ("userId", "key", "itemId", "pos", "data") VALUES ($1, $2, $3, $4, $5::jsonb)', [t.userId, key, item.id, pos, JSON.stringify(item)]);
  return { key, itemId: item.id, pos, data: item };
}

export async function updateCourse(t: CourseTx, key: string, data: Doc): Promise<void> {
  await t.sql.exec('UPDATE "CourseItem" SET "data" = $3::jsonb WHERE "userId" = $1 AND "key" = $2', [t.userId, key, JSON.stringify(data)]);
}

/** Borra todos los cursos con ese id (como `filter` en la lista). */
export const deleteCourses = (t: CourseTx, id: string) => t.sql.exec('DELETE FROM "CourseItem" WHERE "userId" = $1 AND "itemId" = $2', [t.userId, id]);

/**
 * Reordena como la app anterior: primero los ids indicados (en ese orden),
 * después el resto en su orden actual. Solo se leen ids y posiciones.
 */
export async function reorderCourses(t: CourseTx, ids: string[]): Promise<Map<string, number>> {
  const rows = await t.sql.rows<{ key: string; itemId: string | null }>('SELECT "key", "itemId" FROM "CourseItem" WHERE "userId" = $1 ORDER BY "pos", "key"', [t.userId]);
  // Igual que reorderById: si un id se repite, cuenta el último elemento con ese id.
  const byId = new Map<string | null, { key: string }>(rows.map((r) => [r.itemId, r]));
  const used = new Set<string>();
  const first: string[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (r && !used.has(r.key)) {
      used.add(r.key);
      first.push(r.key);
    }
  }
  const order = [...first, ...rows.filter((r) => !used.has(r.key)).map((r) => r.key)];
  const pos = new Map(order.map((k, i) => [k, (i + 1) * 1024]));
  if (order.length) {
    await t.sql.exec(
      `UPDATE "CourseItem" c SET "pos" = u.pos FROM unnest($2::text[], $3::float8[]) AS u(key, pos) WHERE c."userId" = $1 AND c."key" = u.key AND c."pos" <> u.pos`,
      [t.userId, order, order.map((k) => pos.get(k)!)],
    );
  }
  return pos;
}

/**
 * Reemplaza todos los cursos (PUT /api/sync de la app v1). La lista viaja hacia
 * la base, no desde ella.
 */
export async function replaceCourses(t: CourseTx, list: unknown[]): Promise<void> {
  await t.sql.exec('DELETE FROM "CourseItem" WHERE "userId" = $1', [t.userId]);
  if (!list.length) return;
  await t.sql.exec(
    `INSERT INTO "CourseItem" ("userId", "key", "itemId", "pos", "data")
     SELECT $1,
            CASE WHEN x."itemId" IS NOT NULL AND x.n = 1 THEN x."itemId" ELSE '~' || x.o END,
            x."itemId", x.o * 1024, x.v
       FROM (
         SELECT e.v, e.o,
                CASE WHEN jsonb_typeof(e.v->'id') = 'string' THEN e.v->>'id' END AS "itemId",
                row_number() OVER (PARTITION BY CASE WHEN jsonb_typeof(e.v->'id') = 'string' THEN e.v->>'id' END ORDER BY e.o) AS n
           FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS e(v, o)
       ) x`,
    [t.userId, JSON.stringify(list)],
  );
}

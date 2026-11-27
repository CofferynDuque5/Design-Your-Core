import type { Db } from './db.js';

// Mudanza de base de datos sin comandos: si COPY_FROM_DATABASE_URL apunta a la
// base anterior (por ejemplo Neon) y la base nueva (DATABASE_URL, por ejemplo el
// PostgreSQL del hosting) todavía no tiene cuentas, al arrancar se copian todas
// las tablas de la app. La base anterior solo se lee: no se cambia nada en ella.
// Todo se copia en una transacción: si algo falla, la base nueva queda como
// estaba y se reintenta más tarde.
//
// Si en la base nueva ya se crearon cuentas mientras se esperaba (por ejemplo,
// porque la anterior estaba sin horas gratis), se UNEN: las cuentas viejas
// entran con todos sus datos y, si alguien creó otra vez su cuenta con el mismo
// correo, lo que hizo en la nueva se junta con lo de la vieja (nada se borra) y
// se entra con la contraseña de la cuenta vieja.

export interface CopyResult {
  estado: 'copiada' | 'omitida' | 'error';
  detalle: string;
  /** Filas copiadas por tabla. */
  tablas?: Record<string, number>;
}

/** Resultado de la última copia, para mostrarlo en /api/health. */
export const copyStatus: { value: CopyResult | null } = { value: null };

const SKIP = new Set(['_dyc_migrations', '_prisma_migrations']);
/** Marca que deja la copia terminada, para no repetirla en cada arranque. */
export const COPY_MARK = '_mudanza';
const BATCH = 200;

interface TableInfo {
  name: string;
  columns: string[];
  primaryKey: string[];
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

async function tablesOf(db: Db): Promise<Map<string, TableInfo>> {
  const cols = await db.rows<{ table: string; column: string }>(
    `SELECT c.table_name AS "table", c.column_name AS "column"
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position`,
  );
  const pks = await db.rows<{ table: string; column: string }>(
    `SELECT tc.table_name AS "table", kcu.column_name AS "column"
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.table_schema = current_schema() AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position`,
  );
  const out = new Map<string, TableInfo>();
  for (const { table, column } of cols) {
    if (SKIP.has(table)) continue;
    const t = out.get(table) ?? { name: table, columns: [], primaryKey: [] };
    t.columns.push(column);
    out.set(table, t);
  }
  for (const { table, column } of pks) out.get(table)?.primaryKey.push(column);
  return out;
}

/** Ordena las tablas para que cada una vaya después de las que referencia. */
async function insertOrder(db: Db, names: string[]): Promise<string[]> {
  const refs = await db.rows<{ child: string; parent: string }>(
    `SELECT cl.relname AS "child", pr.relname AS "parent"
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_class pr ON pr.oid = con.confrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE con.contype = 'f' AND n.nspname = current_schema()`,
  );
  const deps = new Map(names.map((n) => [n, new Set<string>()]));
  for (const { child, parent } of refs) if (child !== parent && deps.has(child) && deps.has(parent)) deps.get(child)!.add(parent);
  const done: string[] = [];
  const pending = [...names].sort();
  while (pending.length) {
    const i = pending.findIndex((n) => [...deps.get(n)!].every((p) => done.includes(p)));
    // Un ciclo no debería existir; si existiera, se sigue en orden alfabético.
    done.push(pending.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return done;
}

type Doc = Record<string, unknown>;
const isObj = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v);
const idOf = (v: unknown) => (isObj(v) && (typeof v.id === 'string' || typeof v.id === 'number') ? String(v.id) : null);

/**
 * Junta el documento de la cuenta vieja con el de la nueva sin perder nada:
 * las listas se unen por `id` (si un elemento está en las dos, gana el de la
 * nueva, que es lo último que se tocó), los objetos se juntan clave por clave
 * y el resto se queda con el valor nuevo si existe.
 */
export function mergeDocs(old: unknown, fresh: unknown): unknown {
  if (Array.isArray(old) && Array.isArray(fresh)) {
    const freshIds = new Map<string, unknown>();
    for (const x of fresh) {
      const id = idOf(x);
      if (id !== null) freshIds.set(id, x);
    }
    const out: unknown[] = [];
    const used = new Set<string>();
    for (const x of old) {
      const id = idOf(x);
      if (id !== null && freshIds.has(id)) {
        out.push(freshIds.get(id));
        used.add(id);
      } else out.push(x);
    }
    for (const x of fresh) {
      const id = idOf(x);
      if (id === null) {
        if (!out.some((y) => JSON.stringify(y) === JSON.stringify(x))) out.push(x);
      } else if (!used.has(id)) out.push(x);
    }
    return out;
  }
  if (isObj(old) && isObj(fresh)) {
    const out: Doc = { ...old };
    for (const [k, v] of Object.entries(fresh)) out[k] = k in old ? mergeDocs(old[k], v) : v;
    return out;
  }
  return fresh === undefined || fresh === null ? old : fresh;
}

export async function copyFromDatabase(target: Db, source: Db): Promise<CopyResult> {
  const mark = await target.row<{ key: string }>('SELECT "key" FROM "AppSetting" WHERE "key" = $1', [COPY_MARK]);
  if (mark) return { estado: 'omitida', detalle: 'La mudanza ya se hizo: puedes borrar COPY_FROM_DATABASE_URL.' };

  const [to, from] = await Promise.all([tablesOf(target), tablesOf(source)]);
  if (!from.has('User')) return { estado: 'omitida', detalle: 'La base anterior no tiene datos de Design Your Core.' };
  const names = [...to.keys()].filter((n) => from.has(n));
  const order = await insertOrder(target, names);

  const oldUsers = await source.rows<{ id: string; email: string }>('SELECT "id", lower("email") AS "email" FROM "User"');
  const newUsers = await target.rows<{ id: string; email: string }>('SELECT "id", lower("email") AS "email" FROM "User"');
  const newIds = new Set(newUsers.map((u) => u.id));
  if (oldUsers.length && oldUsers.every((u) => newIds.has(u.id))) {
    await target.exec(`INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ($1, '{}'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`, [COPY_MARK]);
    return { estado: 'omitida', detalle: 'La base nueva ya tiene las cuentas de la anterior: no se copió nada.' };
  }
  const merging = newUsers.length > 0;
  // Misma persona con una cuenta en cada base (mismo correo, distinto id): vieja → nueva.
  const byEmail = new Map(newUsers.map((u) => [u.email, u.id]));
  const pairs = oldUsers.flatMap((o) => {
    const fresh = byEmail.get(o.email);
    return fresh && fresh !== o.id ? [{ old: o.id, fresh }] : [];
  });

  // Columnas que apuntan a una cuenta (para pasar lo de la cuenta nueva a la vieja).
  const userRefs = await target.rows<{ table: string; column: string }>(
    `SELECT cl.relname AS "table", a.attname AS "column"
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_class pr ON pr.oid = con.confrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
      WHERE con.contype = 'f' AND n.nspname = current_schema() AND pr.relname = 'User' AND array_length(con.conkey, 1) = 1`,
  );

  const tablas: Record<string, number> = {};
  await target.tx(async (tx) => {
    // El correo de la cuenta nueva se aparta un momento para que entre la vieja.
    for (const p of pairs) await tx.exec(`UPDATE "User" SET "email" = "email" || '#mudanza-' || "id" WHERE "id" = $1`, [p.fresh]);

    for (const name of order) {
      const src = from.get(name)!;
      const dst = to.get(name)!;
      const columns = dst.columns.filter((c) => src.columns.includes(c));
      const list = columns.map(q).join(', ');
      const orderBy = (src.primaryKey.length ? src.primaryKey : columns).map(q).join(', ');
      // Sin cuentas nuevas, la tabla se reemplaza (puede traer filas por defecto de las
      // migraciones). Al unir, lo que ya está se respeta, salvo los ajustes generales.
      const replace = !merging || name === 'AppSetting';
      if (replace) await tx.exec(`DELETE FROM ${q(name)}`);
      let copied = 0;
      for (let offset = 0; ; offset += BATCH) {
        const rows = await source.rows<{ r: unknown }>(
          `SELECT row_to_json(t) AS r FROM (SELECT ${list} FROM ${q(name)} ORDER BY ${orderBy} LIMIT ${BATCH} OFFSET ${offset}) t`,
        );
        if (!rows.length) break;
        copied += await tx.exec(
          `INSERT INTO ${q(name)} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${q(name)}, $1::json)${replace ? '' : ' ON CONFLICT DO NOTHING'}`,
          [JSON.stringify(rows.map((x) => x.r))],
        );
        if (rows.length < BATCH) break;
      }
      tablas[name] = copied;
    }

    // Lo hecho en la cuenta nueva pasa a la vieja, y la nueva se quita.
    for (const p of pairs) {
      const blobs = await tx.rows<{ userId: string; data: unknown }>('SELECT "userId", "data" FROM "Blob" WHERE "userId" = ANY($1)', [[p.old, p.fresh]]);
      const oldDoc = blobs.find((b) => b.userId === p.old)?.data;
      const freshDoc = blobs.find((b) => b.userId === p.fresh)?.data;
      if (freshDoc !== undefined) {
        if (oldDoc === undefined) await tx.exec('UPDATE "Blob" SET "userId" = $1 WHERE "userId" = $2', [p.old, p.fresh]);
        else {
          await tx.exec('UPDATE "Blob" SET "data" = $2::jsonb, "updatedAt" = now() WHERE "userId" = $1', [p.old, JSON.stringify(mergeDocs(oldDoc, freshDoc))]);
          await tx.exec('DELETE FROM "Blob" WHERE "userId" = $1', [p.fresh]);
        }
      }
      for (const ref of userRefs) {
        if (ref.table === 'Blob') continue;
        // Si la cuenta vieja ya tiene esa fila única (perfil, registro del día…), se queda la vieja.
        await tx.exec('SAVEPOINT mudanza');
        try {
          await tx.exec(`UPDATE ${q(ref.table)} SET ${q(ref.column)} = $1 WHERE ${q(ref.column)} = $2`, [p.old, p.fresh]);
          await tx.exec('RELEASE SAVEPOINT mudanza');
        } catch {
          await tx.exec('ROLLBACK TO SAVEPOINT mudanza');
          // Fila por fila: pasan las que no chocan y las repetidas se quedan con la vieja.
          const rows = await tx.rows<{ ctid: string }>(`SELECT ctid::text FROM ${q(ref.table)} WHERE ${q(ref.column)} = $1`, [p.fresh]);
          for (const r of rows) {
            await tx.exec('SAVEPOINT fila');
            try {
              await tx.exec(`UPDATE ${q(ref.table)} SET ${q(ref.column)} = $1 WHERE ctid = $2::tid`, [p.old, r.ctid]);
              await tx.exec('RELEASE SAVEPOINT fila');
            } catch {
              await tx.exec('ROLLBACK TO SAVEPOINT fila');
            }
          }
        }
      }
      await tx.exec('UPDATE "User" SET "partnerId" = $1 WHERE "partnerId" = $2', [p.old, p.fresh]);
      if (to.has('CoupleItem')) await tx.exec(`UPDATE "CoupleItem" SET "pairKey" = replace("pairKey", $2, $1) WHERE "pairKey" LIKE '%' || $2 || '%'`, [p.old, p.fresh]);
      await tx.exec('DELETE FROM "User" WHERE "id" = $1', [p.fresh]);
    }
    await tx.exec(`INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ($1, '{}'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`, [COPY_MARK]);
  });
  const cuentas = tablas.User ?? 0;
  const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
  const unidas = pairs.length ? ` ${plural(pairs.length, 'cuenta se unió con la que creaste de nuevo (entra con tu contraseña anterior)', 'cuentas se unieron con las creadas de nuevo (se entra con la contraseña anterior)')}.` : '';
  return { estado: 'copiada', detalle: `Datos copiados de la base anterior: ${plural(cuentas, 'cuenta', 'cuentas')}.${unidas}`, tablas };
}

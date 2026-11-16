import type { Db } from './db.js';

// Mudanza de base de datos sin comandos: si COPY_FROM_DATABASE_URL apunta a la
// base anterior (por ejemplo Neon) y la base nueva (DATABASE_URL, por ejemplo el
// PostgreSQL del hosting) todavía no tiene cuentas, al arrancar se copian todas
// las tablas de la app. La base anterior solo se lee: no se cambia nada en ella.
// Todo se copia en una transacción: si algo falla, la base nueva queda vacía y
// se reintenta en el siguiente arranque.

export interface CopyResult {
  estado: 'copiada' | 'omitida' | 'error';
  detalle: string;
  /** Filas copiadas por tabla. */
  tablas?: Record<string, number>;
}

/** Resultado de la última copia, para mostrarlo en /api/health. */
export const copyStatus: { value: CopyResult | null } = { value: null };

const SKIP = new Set(['_dyc_migrations', '_prisma_migrations']);
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

export async function copyFromDatabase(target: Db, source: Db): Promise<CopyResult> {
  const users = await target.row<{ n: string }>('SELECT count(*)::text AS n FROM "User"');
  if (Number(users?.n ?? 0) > 0) return { estado: 'omitida', detalle: 'La base nueva ya tiene cuentas: no se copió nada.' };

  const [to, from] = await Promise.all([tablesOf(target), tablesOf(source)]);
  if (!from.has('User')) return { estado: 'omitida', detalle: 'La base anterior no tiene datos de Design Your Core.' };
  const names = [...to.keys()].filter((n) => from.has(n));
  const order = await insertOrder(target, names);

  const tablas: Record<string, number> = {};
  await target.tx(async (tx) => {
    for (const name of order) {
      const src = from.get(name)!;
      const dst = to.get(name)!;
      const columns = dst.columns.filter((c) => src.columns.includes(c));
      const list = columns.map(q).join(', ');
      const orderBy = (src.primaryKey.length ? src.primaryKey : columns).map(q).join(', ');
      // La tabla nueva puede traer filas propias de las migraciones (ajustes por defecto):
      // se reemplazan por las de la base anterior.
      await tx.exec(`DELETE FROM ${q(name)}`);
      let copied = 0;
      for (let offset = 0; ; offset += BATCH) {
        const rows = await source.rows<{ r: unknown }>(
          `SELECT row_to_json(t) AS r FROM (SELECT ${list} FROM ${q(name)} ORDER BY ${orderBy} LIMIT ${BATCH} OFFSET ${offset}) t`,
        );
        if (!rows.length) break;
        copied += await tx.exec(
          `INSERT INTO ${q(name)} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${q(name)}, $1::json)`,
          [JSON.stringify(rows.map((x) => x.r))],
        );
        if (rows.length < BATCH) break;
      }
      tablas[name] = copied;
    }
  });
  const cuentas = tablas.User ?? 0;
  return { estado: 'copiada', detalle: `Datos copiados de la base anterior: ${cuentas} ${cuentas === 1 ? 'cuenta' : 'cuentas'}.`, tablas };
}

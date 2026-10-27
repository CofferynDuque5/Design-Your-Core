import crypto from 'node:crypto';
import pg from 'pg';

// Acceso a Postgres con `pg`, que es JavaScript puro: el paquete de cPanel
// lleva todo dentro y no necesita instalar ni generar nada en el servidor.

// Las columnas `timestamp(3)` (sin zona) guardan la hora UTC, igual que hacía
// Prisma: se leen y se escriben siempre como UTC, sea cual sea la zona del servidor.
pg.defaults.parseInputDatesAsUTC = true;
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (s) => new Date(`${s.replace(' ', 'T')}Z`));
// Las columnas `date` se leen como medianoche UTC de ese día.
pg.types.setTypeParser(pg.types.builtins.DATE, (s) => new Date(`${s}T00:00:00.000Z`));

export type Params = readonly unknown[];

/** Consultas sobre la base (o dentro de una transacción). */
export interface Sql {
  /** Todas las filas. */
  rows<T>(text: string, params?: Params): Promise<T[]>;
  /** La primera fila, o null. */
  row<T>(text: string, params?: Params): Promise<T | null>;
  /** Ejecuta y devuelve cuántas filas cambiaron. */
  exec(text: string, params?: Params): Promise<number>;
}

export interface Db extends Sql {
  /** Ejecuta `fn` en una transacción: si lanza, se deshace todo. */
  tx<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type Runner = { query: (text: string, params?: unknown[]) => Promise<pg.QueryResult> };

function sqlOf(runner: Runner): Sql {
  return {
    rows: async <T>(text: string, params: Params = []) => (await runner.query(text, [...params])).rows as T[],
    row: async <T>(text: string, params: Params = []) => ((await runner.query(text, [...params])).rows[0] as T | undefined) ?? null,
    exec: async (text: string, params: Params = []) => (await runner.query(text, [...params])).rowCount ?? 0,
  };
}

/**
 * Convierte la cadena de conexión en opciones de `pg`. `sslmode` decide el
 * cifrado (Neon lo exige); los parámetros que solo entendía Prisma se ignoran.
 */
export function connectionOptions(url: string): pg.PoolConfig {
  const u = new URL(url);
  const sslmode = (u.searchParams.get('sslmode') || '').toLowerCase();
  const ssl = ['require', 'verify-ca', 'verify-full', 'prefer'].includes(sslmode) || (!sslmode && /\.neon\.tech$/i.test(u.hostname));
  return {
    host: decodeURIComponent(u.hostname),
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || undefined,
    options: u.searchParams.get('options') ?? undefined,
    // Como en libpq: `require` cifra sin comprobar el certificado; `verify-*` lo comprueba.
    ssl: ssl ? { rejectUnauthorized: sslmode.startsWith('verify-') } : false,
  };
}

export function createDb(url: string, opts: { max?: number } = {}): Db {
  if (!url) throw new Error('Falta DATABASE_URL');
  const pool = new pg.Pool({ ...connectionOptions(url), max: opts.max ?? 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  // Neon cierra las conexiones inactivas: no debe tumbar el proceso.
  pool.on('error', (e) => console.error('[core-cloud] base de datos:', e.message));
  return {
    ...sqlOf(pool),
    async tx<T>(fn: (sql: Sql) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(sqlOf(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Id nuevo con la misma forma que los de Prisma (cuid): letras minúsculas y números, empieza por «c». */
export const newId = () => `c${Date.now().toString(36)}${crypto.randomBytes(12).toString('hex').slice(0, 16)}`;

/** `true` si el error es por un valor repetido en una columna única. */
export const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === '23505';

/**
 * INSERT … ON CONFLICT DO UPDATE: crea la fila con `insertOnly` + `data`, o si
 * ya existe cambia solo las columnas de `data`. Las claves undefined se
 * ignoran (como en Prisma) y las de `json` se guardan como jsonb.
 */
export async function upsert<T>(
  sql: Sql,
  table: string,
  conflict: string[],
  insertOnly: Record<string, unknown>,
  data: Record<string, unknown>,
  json: string[] = [],
): Promise<T> {
  const entries = Object.entries({ ...insertOnly, ...data }).filter(([, v]) => v !== undefined);
  for (const [k] of [...entries, ...conflict.map((c) => [c])]) if (!/^[A-Za-z]\w*$/.test(k as string)) throw new Error(`Columna no válida: ${k}`);
  const q = (k: string) => `"${k}"`;
  const cols = entries.map(([k]) => q(k)).join(', ');
  const vals = entries.map(([k], i) => (json.includes(k) ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ');
  const params = entries.map(([k, v]) => (json.includes(k) ? JSON.stringify(v) : v));
  const updates = entries.filter(([k]) => k in data && !conflict.includes(k)).map(([k]) => `${q(k)} = EXCLUDED.${q(k)}`);
  // Sin nada que cambiar, se reescribe la clave para que RETURNING devuelva la fila.
  const set = updates.length ? updates.join(', ') : `${q(conflict[0])} = EXCLUDED.${q(conflict[0])}`;
  const row = await sql.row<T>(`INSERT INTO ${q(table)} (${cols}) VALUES (${vals}) ON CONFLICT (${conflict.map(q).join(', ')}) DO UPDATE SET ${set} RETURNING *`, params);
  return row as T;
}

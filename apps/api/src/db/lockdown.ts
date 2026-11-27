import type { Db } from './db.js';

// Supabase publica automáticamente las tablas del esquema `public` en su API REST
// (roles `anon` y `authenticated`, con la clave pública del proyecto). Esta app no
// usa esa API: todo pasa por nuestro servidor. Para que nadie lea las tablas por
// ahí (correos, contraseñas cifradas, datos), se activa RLS sin políticas y se
// quitan los permisos a esos roles. La app entra como dueña de las tablas, así que
// RLS no le afecta. En bases sin esos roles (Neon, cPanel) no se hace nada.

const API_ROLES = ['anon', 'authenticated'];

export async function lockDownPublicApi(db: Db): Promise<string[]> {
  const roles = (await db.rows<{ rolname: string }>('SELECT rolname FROM pg_roles WHERE rolname = ANY($1)', [API_ROLES])).map((r) => r.rolname);
  if (!roles.length) return [];
  const tables = await db.rows<{ name: string; rls: boolean }>(
    `SELECT c.relname AS name, c.relrowsecurity AS rls
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relkind = 'r' AND pg_get_userbyid(c.relowner) = current_user`,
  );
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  for (const t of tables) if (!t.rls) await db.exec(`ALTER TABLE ${q(t.name)} ENABLE ROW LEVEL SECURITY`);
  const who = roles.map(q).join(', ');
  await db.exec(`REVOKE ALL ON ALL TABLES IN SCHEMA ${q((await db.row<{ s: string }>('SELECT current_schema() AS s'))!.s)} FROM ${who}`);
  return tables.map((t) => t.name);
}

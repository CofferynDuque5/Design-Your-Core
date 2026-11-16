import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/db.js';
import { lockDownPublicApi } from '../src/db/lockdown.js';
import { migrate } from '../src/db/migrate.js';
import { db, TEST_DATABASE_URL } from './helpers.js';

// Una base como la de Supabase: roles `anon` y `authenticated` con permiso de lectura.
const name = 'core_test_supabase';
const url = TEST_DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);

afterAll(async () => {
  await db.exec(`DROP DATABASE IF EXISTS ${name}`);
});

describe('API pública de Supabase', () => {
  it('quita a anon y authenticated el acceso a las tablas y activa RLS', async () => {
    await db.exec(`DROP DATABASE IF EXISTS ${name}`);
    await db.exec(`CREATE DATABASE ${name}`);
    const supa = createDb(url);
    try {
      await supa.exec(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      END $$`);
      await migrate(supa);
      await supa.exec('GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated');
      expect((await supa.row<{ ok: boolean }>(`SELECT has_table_privilege('anon', '"User"', 'SELECT') AS ok`))?.ok).toBe(true);

      const locked = await lockDownPublicApi(supa);
      expect(locked).toContain('User');
      expect((await supa.row<{ ok: boolean }>(`SELECT has_table_privilege('anon', '"User"', 'SELECT') AS ok`))?.ok).toBe(false);
      expect((await supa.row<{ ok: boolean }>(`SELECT has_table_privilege('authenticated', '"Blob"', 'SELECT') AS ok`))?.ok).toBe(false);
      const open = await supa.rows(`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
      expect(open).toEqual([]);
      // La app (dueña de las tablas) sigue leyendo y escribiendo.
      await supa.exec(`INSERT INTO "User" ("id","email","name","passwordHash") VALUES ('u1','a@example.com','A','h')`);
      expect(await supa.rows('SELECT "id" FROM "User"')).toHaveLength(1);
      // Repetirlo al arrancar otra vez no falla.
      await lockDownPublicApi(supa);
    } finally {
      await supa.close();
    }
  });
});

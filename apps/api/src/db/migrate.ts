import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

// Migraciones SQL numeradas (migrations/NNN_nombre.sql), aplicadas al arrancar.
// Así el despliegue en cPanel no necesita ejecutar comandos a mano.
// Cada archivo se aplica una sola vez, dentro de una transacción y con un
// candado para que dos procesos no lo apliquen a la vez.

// src/db/ o dist/db/ en desarrollo; dist/ en el paquete de despliegue (release/).
const CANDIDATES = ['../../migrations/', '../migrations/'].map((p) => fileURLToPath(new URL(p, import.meta.url)));
const DEFAULT_DIR = process.env.MIGRATIONS_DIR || CANDIDATES.find((d) => existsSync(d)) || CANDIDATES[0];
const LOCK_ID = 723_451_901; // arbitrario, propio de esta app

export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function migrate(db: Db, dir: string = DEFAULT_DIR): Promise<string[]> {
  await db.exec('CREATE TABLE IF NOT EXISTS "_dyc_migrations" ("id" text PRIMARY KEY, "appliedAt" timestamp(3) NOT NULL DEFAULT now())');
  const files = readdirSync(dir)
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const statements = splitStatements(readFileSync(`${dir}${file}`, 'utf8'));
    const didApply = await db.tx(async (tx) => {
      await tx.exec(`SELECT pg_advisory_xact_lock(${LOCK_ID})`);
      if (await tx.row('SELECT 1 FROM "_dyc_migrations" WHERE "id" = $1', [id])) return false;
      for (const s of statements) await tx.exec(s);
      await tx.exec('INSERT INTO "_dyc_migrations" ("id") VALUES ($1)', [id]);
      return true;
    });
    if (didApply) {
      applied.push(id);
      console.log(`[core-cloud] migración aplicada: ${id}`);
    }
  }
  return applied;
}

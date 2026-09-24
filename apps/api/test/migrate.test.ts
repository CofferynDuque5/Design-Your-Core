import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { migrate, splitStatements } from '../src/db/migrate.js';
import { prisma, resetDb, TEST_DATABASE_URL } from './helpers.js';

afterAll(() => prisma.$disconnect());

describe('migraciones', () => {
  it('separa sentencias e ignora comentarios', () => {
    expect(splitStatements('-- hola\nCREATE TABLE a (x int);\n\nCREATE INDEX b ON a(x);\n')).toEqual(['CREATE TABLE a (x int)', 'CREATE INDEX b ON a(x)']);
  });

  it('son idempotentes y dejan la base igual que schema.prisma', async () => {
    await resetDb();
    expect(await migrate(prisma)).toEqual([]); // ya aplicadas: no repite nada
    const run = () =>
      execFileSync('npx', ['prisma', 'migrate', 'diff', '--from-url', TEST_DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], {
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        stdio: 'pipe',
      });
    // Con --exit-code, prisma sale con 2 si hay diferencias (lanzaría una excepción).
    expect(() => run()).not.toThrow();
  });

  it('aplica archivos nuevos una sola vez', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dyc-mig-'));
    writeFileSync(join(dir, '900_prueba.sql'), 'CREATE TABLE IF NOT EXISTS "_prueba" (x int);\nINSERT INTO "_prueba" VALUES (1);\n');
    try {
      expect(await migrate(prisma, dir + '/')).toEqual(['900_prueba']);
      expect(await migrate(prisma, dir + '/')).toEqual([]);
      const rows = await prisma.$queryRawUnsafe<unknown[]>('SELECT * FROM "_prueba"');
      expect(rows).toHaveLength(1);
    } finally {
      await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "_prueba"');
      await prisma.$executeRawUnsafe('DELETE FROM "_dyc_migrations" WHERE "id" = \'900_prueba\'');
    }
  });
});

describe('actualización de una base en producción', () => {
  it('conserva cuentas y datos existentes al añadir las tablas v2', async () => {
    const name = 'core_test_legacy';
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name}`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE ${name}`);
    const url = TEST_DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
    const legacy = new PrismaClient({ datasources: { db: { url } } });
    try {
      // Estado de producción: tablas creadas por la versión original, con datos y sin registro de migraciones.
      for (const s of splitStatements(readFileSync('migrations/001_base.sql', 'utf8'))) await legacy.$executeRawUnsafe(s);
      await legacy.$executeRawUnsafe(`INSERT INTO "User" ("id","email","name","passwordHash") VALUES ('u1','ana@example.com','Ana','hash')`);
      await legacy.$executeRawUnsafe(`INSERT INTO "Blob" ("userId","data") VALUES ('u1','{"habits":[{"label":"Leer"}]}')`);

      expect(await migrate(legacy)).toEqual(['001_base', '002_pillars', '003_sessions_devices']);

      const user = await legacy.user.findUniqueOrThrow({ where: { id: 'u1' }, include: { blob: true } });
      expect(user.email).toBe('ana@example.com');
      expect(user.blob?.data).toEqual({ habits: [{ label: 'Leer' }] });
      await legacy.checkIn.create({ data: { userId: 'u1', date: new Date('2026-09-23T00:00:00Z'), mood: 4 } });
      expect(await legacy.checkIn.count()).toBe(1);
    } finally {
      await legacy.$disconnect();
      await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name}`);
    }
  });
});

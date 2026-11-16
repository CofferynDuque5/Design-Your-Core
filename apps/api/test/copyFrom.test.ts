import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFromDatabase } from '../src/db/copyFrom.js';
import { createDb, type Db } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { databaseProblem } from '../src/lib/safeMode.js';
import { db, TEST_DATABASE_URL } from './helpers.js';

// Mudanza de Neon al PostgreSQL del hosting: dos bases reales, la anterior con datos.
const urlOf = (name: string) => TEST_DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
let source: Db;
let target: Db;

beforeAll(async () => {
  for (const n of ['core_test_old', 'core_test_new']) {
    await db.exec(`DROP DATABASE IF EXISTS ${n}`);
    await db.exec(`CREATE DATABASE ${n}`);
  }
  source = createDb(urlOf('core_test_old'));
  target = createDb(urlOf('core_test_new'));
  await migrate(source);
  await migrate(target);
  await source.exec(`INSERT INTO "User" ("id","email","name","passwordHash","plan") VALUES ('u1','ana@example.com','Ana','hash','pro'), ('u2','luis@example.com','Luis','hash2','gratis')`);
  await source.exec(`INSERT INTO "Blob" ("userId","updatedAt","data") VALUES ('u1',now(),'{"habits":[{"label":"Leer"}],"nota":"ñandú \\"comillas\\""}')`);
  await source.exec(`INSERT INTO "CheckIn" ("id","userId","date","mood","updatedAt") VALUES ('c1','u1','2026-09-23',4,'2026-09-23 10:30:00.123')`);
  await source.exec(`INSERT INTO "AppSetting" ("key","value") VALUES ('billing','{"rates":{"VES":40.5}}')`);
  await source.exec(
    `INSERT INTO "PaymentRequest" ("id","userId","plan","period","methodId","methodName","currency","amount","amountUsd","reference","payerName")
     VALUES ('p1','u1','pro','mes','pm','Pago Móvil','VES',161.62,3.99,'123','Ana')`,
  );
  for (let i = 0; i < 450; i++) {
    await source.exec(`INSERT INTO "CoupleItem" ("id","pairKey","kind","data","createdBy") VALUES ($1,'u1:u2','meta',$2,'u1')`, [`ci${i}`, JSON.stringify({ title: `Meta ${i}` })]);
  }
});

afterAll(async () => {
  await source.close();
  await target.close();
  for (const n of ['core_test_old', 'core_test_new']) await db.exec(`DROP DATABASE IF EXISTS ${n}`);
});

describe('copia desde la base anterior', () => {
  it('copia todas las tablas sin tocar la base anterior', async () => {
    const result = await copyFromDatabase(target, source);
    expect(result.estado).toBe('copiada');
    expect(result.detalle).toMatch(/2 cuentas/);
    expect(result.tablas).toMatchObject({ User: 2, Blob: 1, CheckIn: 1, PaymentRequest: 1, CoupleItem: 450, AppSetting: 1 });

    const ana = await target.row<{ plan: string; data: { nota: string } }>('SELECT u."plan", b."data" FROM "User" u JOIN "Blob" b ON b."userId" = u."id" WHERE u."id" = \'u1\'');
    expect(ana).toEqual({ plan: 'pro', data: { habits: [{ label: 'Leer' }], nota: 'ñandú "comillas"' } });
    const check = await target.row<{ date: Date; updatedAt: Date }>('SELECT "date", "updatedAt" FROM "CheckIn"');
    expect(check?.date.toISOString()).toBe('2026-09-23T00:00:00.000Z');
    expect(check?.updatedAt.toISOString()).toBe('2026-09-23T10:30:00.123Z');
    const pay = await target.row<{ amount: string }>('SELECT "amount"::text AS amount FROM "PaymentRequest"');
    expect(pay?.amount).toBe('161.62');
    expect((await source.row<{ n: string }>('SELECT count(*)::text AS n FROM "User"'))?.n).toBe('2');
  });

  it('no vuelve a copiar si la base nueva ya tiene cuentas', async () => {
    const again = await copyFromDatabase(target, source);
    expect(again.estado).toBe('omitida');
    expect((await target.row<{ n: string }>('SELECT count(*)::text AS n FROM "CoupleItem"'))?.n).toBe('450');
  });

  it('explica cuando Neon se queda sin horas gratis', () => {
    expect(databaseProblem(new Error('Your account or project has exceeded the compute time quota.'))).toMatch(/horas gratis/);
  });
});

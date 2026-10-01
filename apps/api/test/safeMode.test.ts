import { describe, expect, it } from 'vitest';
import { databaseProblem, startupProblem } from '../src/lib/safeMode.js';

describe('arranque protegido', () => {
  it('explica qué hacer en los fallos típicos de cPanel', () => {
    expect(startupProblem(new Error('JWT_SECRET debe tener 32+ caracteres en producción'))).toMatch(/al menos 32 caracteres/);
    expect(startupProblem(new Error('Falta DATABASE_URL'))).toMatch(/Pega tu cadena de Neon/);
    expect(startupProblem(new TypeError('Invalid URL'))).toMatch(/DATABASE_URL/);
    expect(startupProblem(new Error("Cannot find module '/home/x/core-api/dist/server.mjs'"))).toMatch(/Vuelve a extraer el ZIP/);
  });

  it('nunca muestra la contraseña de una cadena de conexión', () => {
    const msg = startupProblem(new Error('Invalid datasource postgresql://usuario:secreta@ep-1.neon.tech/db\nmás detalle'));
    expect(msg).not.toContain('secreta');
    expect(msg).toContain('postgresql://***@ep-1.neon.tech/db');
    expect(msg).not.toContain('más detalle');
  });

  it('explica los fallos de conexión con la base de datos', () => {
    expect(databaseProblem(Object.assign(new Error('password authentication failed for user "x"'), { code: '28P01' }))).toMatch(/usuario o la contraseña/);
    expect(databaseProblem(Object.assign(new Error('getaddrinfo ENOTFOUND ep-x.neon.tech'), { code: 'ENOTFOUND' }))).toMatch(/host de DATABASE_URL/);
    expect(databaseProblem(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toMatch(/puerto 5432/);
    expect(databaseProblem(new Error('timeout exceeded when trying to connect'))).toMatch(/no respondió a tiempo/);
    expect(databaseProblem(Object.assign(new Error('duplicate key'), { code: '23505' }))).toBeNull();
  });
});

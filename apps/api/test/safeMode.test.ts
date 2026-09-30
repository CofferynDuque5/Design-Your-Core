import { describe, expect, it } from 'vitest';
import { startupProblem } from '../src/lib/safeMode.js';

describe('arranque protegido', () => {
  it('explica qué hacer en los fallos típicos de cPanel', () => {
    expect(startupProblem(new Error('JWT_SECRET debe tener 32+ caracteres en producción'))).toMatch(/al menos 32 caracteres/);
    expect(startupProblem(new Error('@prisma/client did not initialize yet. Please run "prisma generate"'))).toMatch(/Run NPM Install/);
    expect(startupProblem(new Error("Named export 'PrismaClient' not found. The requested module '@prisma/client' is a CommonJS module"))).toMatch(/Run NPM Install/);
    expect(startupProblem(new Error("Cannot find package 'express' imported from /x"))).toMatch(/Run NPM Install/);
  });

  it('nunca muestra la contraseña de una cadena de conexión', () => {
    const msg = startupProblem(new Error('Invalid datasource postgresql://usuario:secreta@ep-1.neon.tech/db\nmás detalle'));
    expect(msg).not.toContain('secreta');
    expect(msg).toContain('postgresql://***@ep-1.neon.tech/db');
    expect(msg).not.toContain('más detalle');
  });
});

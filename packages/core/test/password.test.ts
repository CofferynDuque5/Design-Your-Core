import { describe, expect, it } from 'vitest';
import { isEmail, isStrongPassword, passwordChecks } from '../src/password.js';

describe('contraseñas', () => {
  it('marca cada regla por separado', () => {
    const ok = (p: string) => Object.fromEntries(passwordChecks(p).map((c) => [c.id, c.ok]));
    expect(ok('')).toEqual({ length: false, upper: false, lower: false, number: false, symbol: false });
    expect(ok('Contraseña1')).toEqual({ length: true, upper: true, lower: true, number: true, symbol: false });
    expect(ok('abc!')).toMatchObject({ lower: true, symbol: true, upper: false });
  });

  it('el símbolo es opcional', () => {
    expect(isStrongPassword('Contraseña1')).toBe(true);
    expect(isStrongPassword('Ñandú2026')).toBe(true);
    expect(isStrongPassword('contraseña1')).toBe(false);
    expect(isStrongPassword('CONTRASEÑA1')).toBe(false);
    expect(isStrongPassword('Contraseña')).toBe(false);
    expect(isStrongPassword('Abc1')).toBe(false);
  });
});

describe('correo', () => {
  it('acepta correos normales y rechaza los incompletos', () => {
    for (const v of ['ana@example.com', ' ana.perez+dyc@correo.co.mx ', 'x@sub.dominio.io']) expect(isEmail(v)).toBe(true);
    for (const v of ['', 'ana', 'ana@', 'usuario@ejemplo', 'ana@@x.com', 'a b@x.com', 'ana@x.c', 'ana@.com']) expect(isEmail(v)).toBe(false);
  });
});

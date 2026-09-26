import { VAULT_MIN_ITERATIONS, vaultSecureSchema } from '@dyc/core';
import { describe, expect, it } from 'vitest';
import { createVault, decryptEntry, DamagedEntryError, encryptEntry, encryptLegacy, fromB64, generatePassword, passwordStrength, toB64, unlockVault, WrongPasswordError } from './vaultCrypto';

const MASTER = 'una frase larga y fácil de recordar';
const entry = { name: 'Banco Sol', mono: 'BS', user: 'ana.perez', pass: 'Clave-Plana-123', url: 'banco.example', note: 'PIN en el cajón' };

describe('Cifrado de la Bóveda', () => {
  it('crea una bóveda válida para el servidor (PBKDF2 600 000, sal de 16 y IV de 12 bytes)', async () => {
    const { vault } = await createVault(MASTER);
    expect(vaultSecureSchema.parse(vault)).toEqual(vault);
    expect(vault.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: VAULT_MIN_ITERATIONS });
    expect(fromB64(vault.kdf.salt)).toHaveLength(16);
    expect(fromB64(vault.check.iv)).toHaveLength(12);
    // Cada bóveda tiene su propia sal.
    expect((await createVault(MASTER)).vault.kdf.salt).not.toBe(vault.kdf.salt);
  });

  it('ida y vuelta: cifra y descifra con la contraseña maestra, con un IV distinto cada vez', async () => {
    const { vault, key } = await createVault(MASTER);
    const a = await encryptEntry(key, 'e1', entry);
    const b = await encryptEntry(key, 'e1', entry);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    expect(atob(a.ct)).not.toContain('Clave-Plana');
    const again = await unlockVault(vault, MASTER);
    expect(await decryptEntry(again, a)).toEqual(entry);
  });

  it('rechaza una contraseña maestra incorrecta', async () => {
    const { vault } = await createVault(MASTER);
    await expect(unlockVault(vault, 'una frase larga y fácil de recordaR')).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(unlockVault(vault, '')).rejects.toThrow('La contraseña maestra no es correcta.');
  });

  it('rechaza un cifrado alterado, otro IV o una entrada movida a otro id', async () => {
    const { key } = await createVault(MASTER);
    const item = await encryptEntry(key, 'e1', entry);
    const bytes = fromB64(item.ct);
    bytes[3] ^= 1;
    await expect(decryptEntry(key, { ...item, ct: toB64(bytes) })).rejects.toBeInstanceOf(DamagedEntryError);
    const iv = fromB64(item.iv);
    iv[0] ^= 1;
    await expect(decryptEntry(key, { ...item, iv: toB64(iv) })).rejects.toBeInstanceOf(DamagedEntryError);
    await expect(decryptEntry(key, { ...item, id: 'e2' })).rejects.toBeInstanceOf(DamagedEntryError);
    // Con otra bóveda (otra clave) tampoco se abre.
    const other = await createVault(MASTER);
    await expect(decryptEntry(other.key, item)).rejects.toBeInstanceOf(DamagedEntryError);
  });

  it('la migración no deja texto en claro en lo que se guarda', async () => {
    const { vault, key } = await createVault(MASTER);
    const legacy = [
      { id: 'v1', name: 'Banco Sol', mono: 'BS', user: 'ana.perez', pass: 'Clave-Plana-123' },
      { id: 'v2', name: '', mono: '', user: '', pass: 'otra-clave-456' },
    ];
    let n = 0;
    const { items, legacyIds } = await encryptLegacy(key, legacy, () => `n${++n}`);
    expect(legacyIds).toEqual(['v1', 'v2']);
    const blob = JSON.stringify({ vault: [], vaultSecure: { ...vault, items } });
    expect(vaultSecureSchema.safeParse({ ...vault, items }).success).toBe(true);
    for (const secret of ['Clave-Plana-123', 'otra-clave-456', 'ana.perez', 'Banco Sol', MASTER]) expect(blob).not.toContain(secret);
    expect(await decryptEntry(key, items[1])).toEqual({ name: 'Sin nombre', mono: '', user: '', pass: 'otra-clave-456' });
  });

  it('genera contraseñas aleatorias con cada tipo de carácter', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(20);
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
    expect(generatePassword(16, { symbols: false })).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it('estima la fuerza de una contraseña', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('abc12').score).toBe(0);
    expect(passwordStrength('aaaaaaaaaaaa').score).toBeLessThanOrEqual(1);
    expect(passwordStrength('caballo correcto batería grapa').score).toBe(4);
    expect(passwordStrength(generatePassword(20)).label).toBe('Muy fuerte');
  });
});

import { cleanEntry, DamagedEntryError, fromB64, toB64, VAULT_CHECK_TEXT, VAULT_MIN_ITERATIONS, VAULT_VERSION, WrongPasswordError, type VaultEntry, type VaultItem, type VaultSecure } from '@dyc/core';

// Entradas, errores, generador y fuerza viven en @dyc/core (los comparte el móvil).
export { cleanEntry, DamagedEntryError, ENTRY_LIMITS, fromB64, toB64, generatePassword, passwordStrength, WrongPasswordError, type Strength, type VaultEntry } from '@dyc/core';

/**
 * Cifrado de la Bóveda, solo con Web Crypto y en este dispositivo.
 *
 * - Contraseña maestra → PBKDF2-SHA-256 (sal aleatoria de 16 bytes, 600 000
 *   iteraciones) → clave AES-GCM de 256 bits que no se puede exportar.
 * - Cada entrada se cifra con su propio IV aleatorio de 12 bytes. El id de la
 *   entrada va como dato autenticado: un cifrado no se puede mover a otra entrada.
 * - `check` cifra una constante conocida para saber si la contraseña es la buena.
 *
 * Ni la contraseña maestra ni la clave salen nunca del navegador.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const random = (n: number) => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function seal(key: CryptoKey, text: string, aad: string): Promise<{ iv: string; ct: string }> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(text));
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

async function unseal(key: CryptoKey, box: { iv: string; ct: string }, aad: string): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv), additionalData: enc.encode(aad) }, key, fromB64(box.ct));
  return dec.decode(plain);
}

/** Crea una bóveda vacía y devuelve también la clave (ya desbloqueada). */
export async function createVault(password: string, iterations: number = VAULT_MIN_ITERATIONS): Promise<{ vault: VaultSecure; key: CryptoKey }> {
  const salt = random(16);
  const key = await deriveKey(password, salt, iterations);
  const check = await seal(key, VAULT_CHECK_TEXT, 'check');
  return { vault: { v: VAULT_VERSION, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) }, check, items: [] }, key };
}

/** Comprueba la contraseña maestra y devuelve la clave. Lanza WrongPasswordError si no es la buena. */
export async function unlockVault(vault: Pick<VaultSecure, 'kdf' | 'check'>, password: string): Promise<CryptoKey> {
  const key = await deriveKey(password, fromB64(vault.kdf.salt), vault.kdf.iterations);
  try {
    if ((await unseal(key, vault.check, 'check')) === VAULT_CHECK_TEXT) return key;
  } catch {
    /* AES-GCM rechaza la etiqueta: contraseña incorrecta (o datos cambiados) */
  }
  throw new WrongPasswordError();
}

export async function encryptEntry(key: CryptoKey, id: string, entry: VaultEntry): Promise<VaultItem> {
  return { id, ...(await seal(key, JSON.stringify(cleanEntry(entry)), `item:${id}`)) };
}

/** Descifra una entrada. Lanza DamagedEntryError si el cifrado se cambió o no es de esta bóveda. */
export async function decryptEntry(key: CryptoKey, item: VaultItem): Promise<VaultEntry> {
  try {
    const data = JSON.parse(await unseal(key, item, `item:${item.id}`));
    if (!data || typeof data !== 'object') throw new Error();
    return cleanEntry(data);
  } catch {
    throw new DamagedEntryError();
  }
}

/**
 * Cifra las entradas de la bóveda antigua (`vault`, en texto plano) para la
 * migración. Devuelve también los ids que se quitarán de la lista antigua.
 */
export async function encryptLegacy(
  key: CryptoKey,
  entries: Array<{ id: string; name: string; mono: string; user: string; pass: string }>,
  newId: () => string,
): Promise<{ items: VaultItem[]; legacyIds: string[] }> {
  const items = await Promise.all(
    entries.map((e) => encryptEntry(key, newId(), { name: e.name.trim() || 'Sin nombre', mono: e.mono, user: e.user, pass: e.pass })),
  );
  return { items, legacyIds: entries.map((e) => e.id).filter(Boolean) };
}


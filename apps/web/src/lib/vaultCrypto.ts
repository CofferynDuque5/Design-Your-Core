import { VAULT_MIN_ITERATIONS, VAULT_VERSION, type VaultItem, type VaultSecure } from '@dyc/core';

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

export interface VaultEntry {
  name: string;
  /** Iniciales para el icono (como `mono` en la app anterior). */
  mono: string;
  user: string;
  pass: string;
  url?: string;
  note?: string;
}

export const ENTRY_LIMITS = { name: 120, user: 200, pass: 500, url: 500, note: 2000 } as const;
const CHECK_TEXT = 'design-your-core/boveda/v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

export class WrongPasswordError extends Error {
  constructor() {
    super('La contraseña maestra no es correcta.');
    this.name = 'WrongPasswordError';
  }
}

export class DamagedEntryError extends Error {
  constructor() {
    super('No se pudo descifrar esta entrada: los datos están dañados o se cambiaron.');
    this.name = 'DamagedEntryError';
  }
}

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

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
  const check = await seal(key, CHECK_TEXT, 'check');
  return { vault: { v: VAULT_VERSION, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) }, check, items: [] }, key };
}

/** Comprueba la contraseña maestra y devuelve la clave. Lanza WrongPasswordError si no es la buena. */
export async function unlockVault(vault: Pick<VaultSecure, 'kdf' | 'check'>, password: string): Promise<CryptoKey> {
  const key = await deriveKey(password, fromB64(vault.kdf.salt), vault.kdf.iterations);
  try {
    if ((await unseal(key, vault.check, 'check')) === CHECK_TEXT) return key;
  } catch {
    /* AES-GCM rechaza la etiqueta: contraseña incorrecta (o datos cambiados) */
  }
  throw new WrongPasswordError();
}

/** Deja una entrada con sus campos de texto y dentro de los límites. */
export function cleanEntry(e: Partial<VaultEntry>): VaultEntry {
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v : '').slice(0, max);
  const out: VaultEntry = { name: s(e.name, ENTRY_LIMITS.name).trim(), mono: s(e.mono, 8), user: s(e.user, ENTRY_LIMITS.user), pass: s(e.pass, ENTRY_LIMITS.pass) };
  const url = s(e.url, ENTRY_LIMITS.url).trim();
  const note = s(e.note, ENTRY_LIMITS.note);
  if (url) out.url = url;
  if (note.trim()) out.note = note;
  return out;
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

// ---------- Generador y fuerza ----------

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  symbols: '!#$%&*+-=?@^_~',
};

/** Número aleatorio uniforme en [0, n) (sin sesgo de módulo). */
function randomBelow(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Contraseña aleatoria con minúsculas, mayúsculas, números y (si se quiere) símbolos; al menos uno de cada. */
export function generatePassword(length = 20, { symbols = true }: { symbols?: boolean } = {}): string {
  const sets = [SETS.lower, SETS.upper, SETS.digits, ...(symbols ? [SETS.symbols] : [])];
  const all = sets.join('');
  const n = Math.max(length, sets.length);
  const chars = [...sets.map((set) => set[randomBelow(set.length)]), ...Array.from({ length: n - sets.length }, () => all[randomBelow(all.length)])];
  // Mezcla (Fisher-Yates) para que los obligatorios no queden al principio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export interface Strength {
  /** 0 (muy débil) a 4 (muy fuerte). */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const LABELS = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'] as const;

/** Estimación orientativa por longitud y variedad de caracteres. */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: LABELS[0] };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  const unique = new Set(pw).size;
  // Repetir caracteres o usar muy pocos distintos aporta menos.
  const bits = Math.min(pw.length, unique * 2) * Math.log2(Math.max(pool, 2));
  const score = (pw.length < 8 ? 0 : bits < 45 ? 1 : bits < 65 ? 2 : bits < 90 ? 3 : 4) as Strength['score'];
  return { score, label: LABELS[score] };
}

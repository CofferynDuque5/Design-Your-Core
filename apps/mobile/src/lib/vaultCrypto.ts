import {
  cleanEntry,
  DamagedEntryError,
  fromB64,
  toB64,
  VAULT_CHECK_TEXT,
  VAULT_MIN_ITERATIONS,
  VAULT_VERSION,
  WrongPasswordError,
  type VaultEntry,
  type VaultItem,
  type VaultSecure,
} from '@dyc/core';
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as ExpoCrypto from 'expo-crypto';

/**
 * Cifrado de la Bóveda en el teléfono. Es exactamente el de la web
 * (PBKDF2-SHA-256 → AES-GCM de 256 bits, IV de 12 bytes, el id como dato
 * autenticado), así una bóveda creada en la web se abre aquí y al revés.
 *
 * El motor de JavaScript del teléfono (Hermes) no trae Web Crypto, así que se
 * hace con @noble (JavaScript puro y auditado) y bytes aleatorios del sistema
 * (expo-crypto). Derivar la clave con 600 000 iteraciones tarda cerca de un
 * minuto aquí: por eso, tras la primera vez, la clave se puede guardar en el
 * llavero protegida con huella o Face ID (ver vaultKey.ts).
 */

/** La clave AES (32 bytes). Solo vive en memoria mientras la bóveda está abierta. */
export type VaultKey = Uint8Array;

// El generador de contraseñas de @dyc/core usa `crypto.getRandomValues`, que Hermes no trae.
const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = { ...(g.crypto ?? {}), getRandomValues: <T extends ArrayBufferView>(a: T) => ExpoCrypto.getRandomValues(a as never) as T };
}

const random = (n: number) => ExpoCrypto.getRandomBytes(n);

/** UTF-8 sin TextDecoder (Hermes no siempre lo trae). */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b >= 0xc0 && b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xe0 && b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    out += String.fromCodePoint(cp);
  }
  return out;
}
const utf8 = (s: string) => new TextEncoder().encode(s);

/** Contraseña maestra → clave. No bloquea la pantalla: cede el control cada pocos milisegundos. */
export function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<VaultKey> {
  return pbkdf2Async(sha256, utf8(password.normalize('NFC')), salt, { c: iterations, dkLen: 32, asyncTick: 16 });
}

function seal(key: VaultKey, text: string, aad: string): { iv: string; ct: string } {
  const iv = random(12);
  return { iv: toB64(iv), ct: toB64(gcm(key, iv, utf8(aad)).encrypt(utf8(text))) };
}

function unseal(key: VaultKey, box: { iv: string; ct: string }, aad: string): string {
  return utf8Decode(gcm(key, fromB64(box.iv), utf8(aad)).decrypt(fromB64(box.ct)));
}

/** ¿Esta clave abre esta bóveda? (Para la clave guardada con huella o Face ID.) */
export function keyOpens(vault: Pick<VaultSecure, 'check'>, key: VaultKey): boolean {
  try {
    return unseal(key, vault.check, 'check') === VAULT_CHECK_TEXT;
  } catch {
    return false;
  }
}

export async function createVault(password: string, iterations: number = VAULT_MIN_ITERATIONS): Promise<{ vault: VaultSecure; key: VaultKey }> {
  const salt = random(16);
  const key = await deriveKey(password, salt, iterations);
  const check = seal(key, VAULT_CHECK_TEXT, 'check');
  return { vault: { v: VAULT_VERSION, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) }, check, items: [] }, key };
}

/** Comprueba la contraseña maestra y devuelve la clave. Lanza WrongPasswordError si no es la buena. */
export async function unlockVault(vault: Pick<VaultSecure, 'kdf' | 'check'>, password: string): Promise<VaultKey> {
  const key = await deriveKey(password, fromB64(vault.kdf.salt), vault.kdf.iterations);
  if (keyOpens(vault, key)) return key;
  throw new WrongPasswordError();
}

export function encryptEntry(key: VaultKey, id: string, entry: VaultEntry): VaultItem {
  return { id, ...seal(key, JSON.stringify(cleanEntry(entry)), `item:${id}`) };
}

/** Descifra una entrada. Lanza DamagedEntryError si el cifrado se cambió o no es de esta bóveda. */
export function decryptEntry(key: VaultKey, item: VaultItem): VaultEntry {
  try {
    const data = JSON.parse(unseal(key, item, `item:${item.id}`));
    if (!data || typeof data !== 'object') throw new Error();
    return cleanEntry(data);
  } catch {
    throw new DamagedEntryError();
  }
}

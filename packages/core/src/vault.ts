import { z } from 'zod';
import { legacyIdSchema } from './legacy.js';

/**
 * Bóveda cifrada (clave nueva `vaultSecure` del documento de la app anterior).
 *
 * Todo se cifra en el navegador con Web Crypto: la contraseña maestra se
 * convierte en una clave AES-GCM de 256 bits con PBKDF2-SHA-256 (sal aleatoria
 * de 16 bytes y al menos 600 000 iteraciones) y cada entrada se cifra con su
 * propio IV aleatorio de 12 bytes. `check` es una constante cifrada que sirve
 * para comprobar la contraseña maestra. El servidor solo valida la forma y el
 * tamaño: nunca ve la contraseña maestra ni el contenido.
 *
 * La clave antigua `vault` (contraseñas en texto plano de la app anterior) no
 * se toca salvo en la migración que la persona confirma.
 */

export const VAULT_VERSION = 1;
export const VAULT_MIN_ITERATIONS = 600_000;
export const VAULT_MAX_ITEMS = 2000;

/** Base64 estándar de exactamente `bytes` bytes. */
const b64Exact = (bytes: number) => {
  const len = Math.ceil(bytes / 3) * 4;
  return z
    .string()
    .length(len, `Debe tener ${bytes} bytes en base64`)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Base64 no válido')
    .refine((s) => (s.length / 4) * 3 - (s.match(/=+$/)?.[0].length ?? 0) === bytes, `Debe tener ${bytes} bytes en base64`);
};
/** Base64 estándar de hasta `maxBytes` bytes (y al menos 16: la etiqueta de AES-GCM). */
const b64Max = (maxBytes: number) =>
  z
    .string()
    .min(24, 'Dato cifrado demasiado corto')
    .max(Math.ceil(maxBytes / 3) * 4, 'Dato cifrado demasiado largo')
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'Base64 no válido');

/** Una entrada cifrada: el `ct` contiene `{ name, mono, user, pass, url?, note? }` en JSON. */
export const vaultItemSchema = z.object({ id: legacyIdSchema, iv: b64Exact(12), ct: b64Max(16_384) }).strict();
export type VaultItem = z.infer<typeof vaultItemSchema>;

export const vaultKdfSchema = z
  .object({
    name: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.number().int().min(VAULT_MIN_ITERATIONS, `Al menos ${VAULT_MIN_ITERATIONS} iteraciones`).max(10_000_000),
    salt: b64Exact(16),
  })
  .strict();

const uniqueIds = (items: Array<{ id: string }>) => new Set(items.map((i) => i.id)).size === items.length;

/** La bóveda completa (se crea con PUT; después se cambia entrada a entrada). */
export const vaultSecureSchema = z
  .object({
    v: z.literal(VAULT_VERSION),
    kdf: vaultKdfSchema,
    check: z.object({ iv: b64Exact(12), ct: b64Max(256) }).strict(),
    items: z.array(vaultItemSchema).max(VAULT_MAX_ITEMS).default([]),
  })
  .strict()
  .refine((v) => uniqueIds(v.items), { message: 'Ids repetidos', path: ['items'] });
export type VaultSecure = z.infer<typeof vaultSecureSchema>;

/** Cambiar una entrada: IV nuevo y contenido cifrado de nuevo. */
export const vaultItemPatchSchema = z.object({ iv: b64Exact(12), ct: b64Max(16_384) }).strict();

/**
 * Migración confirmada: entradas ya cifradas en el navegador y los ids de la
 * lista antigua `vault` que cifran (se quitan de ella en la misma escritura).
 */
export const vaultMigrateSchema = z
  .object({
    items: z.array(vaultItemSchema).min(1).max(VAULT_MAX_ITEMS),
    legacyIds: z.array(z.string().min(1).max(200)).min(1).max(5000),
  })
  .strict()
  .refine((v) => uniqueIds(v.items), { message: 'Ids repetidos', path: ['items'] });

/** Entrada de la bóveda antigua (`vault`), con la contraseña en texto plano. */
export interface LegacyVaultEntry {
  id: string;
  name: string;
  mono: string;
  user: string;
  pass: string;
}

/** Lista antigua `vault` con la defensa de la app anterior: solo objetos, campos de texto. */
export function legacyVault(data: Record<string, unknown> | null | undefined): LegacyVaultEntry[] {
  const v = data?.vault;
  if (!Array.isArray(v)) return [];
  const str = (x: unknown) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => ({ id: str(x.id), name: str(x.name), mono: str(x.mono), user: str(x.user), pass: str(x.pass) }));
}

/** La bóveda cifrada del documento, o null si no hay (o no tiene una forma válida). */
export function vaultSecureOf(data: Record<string, unknown> | null | undefined): VaultSecure | null {
  const r = vaultSecureSchema.safeParse(data?.vaultSecure);
  return r.success ? r.data : null;
}

/** Iniciales para el icono de una entrada, como `mono` en la app anterior («GitHub» → «GI», «Banco Sol» → «BS»). */
export function vaultMono(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const letters = words.length > 1 ? words[0][0] + words[1][0] : Array.from(words[0]).slice(0, 2).join('');
  return letters.toUpperCase();
}

// ---------- Entradas (descifradas), generador y fuerza ----------
// Lo comparten la web (Web Crypto) y el móvil (cifrado en JavaScript): el
// cifrado es el mismo, solo cambia quién lo hace.

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
/** Constante cifrada en `check` para saber si la contraseña maestra es la buena. */
export const VAULT_CHECK_TEXT = 'design-your-core/boveda/v1';

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

// ---------- Base64 (como guarda la web los bytes) ----------

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

// ---------- Cambios en la caché ----------

/** Cambios en `vaultSecure`; todo llega ya cifrado. */
export type VaultOp =
  | { type: 'create'; vault: VaultSecure }
  | { type: 'destroy' }
  | { type: 'add'; item: VaultItem }
  | { type: 'update'; item: VaultItem }
  | { type: 'remove'; id: string }
  | { type: 'migrate'; items: VaultItem[]; legacyIds: string[] };

type Doc = Record<string, unknown>;
const itemsOf = (d: Doc): VaultItem[] => {
  const v = d.vaultSecure as { items?: unknown } | undefined;
  return v && Array.isArray(v.items) ? (v.items as VaultItem[]) : [];
};
const withItems = (d: Doc, items: VaultItem[]): Doc => (d.vaultSecure ? { ...d, vaultSecure: { ...(d.vaultSecure as object), items } } : d);

/** Aplica un cambio de la bóveda al documento, igual que el servidor. */
export function applyVaultOp<D extends object>(data: D, op: VaultOp): D {
  const d = data as Doc;
  switch (op.type) {
    case 'create':
      return { ...d, vaultSecure: op.vault } as D;
    case 'destroy': {
      const { vaultSecure: _drop, ...rest } = d;
      return rest as D;
    }
    case 'add':
      return withItems(d, [...itemsOf(d), op.item]) as D;
    case 'update':
      return withItems(d, itemsOf(d).map((x) => (x.id === op.item.id ? op.item : x))) as D;
    case 'remove':
      return withItems(d, itemsOf(d).filter((x) => x.id !== op.id)) as D;
    case 'migrate': {
      const drop = new Set(op.legacyIds);
      const legacy = Array.isArray(d.vault) ? (d.vault as Array<{ id?: unknown }>) : [];
      return { ...withItems(d, [...itemsOf(d), ...op.items]), vault: legacy.filter((x) => !(x && typeof x.id === 'string' && drop.has(x.id))) } as D;
    }
  }
}

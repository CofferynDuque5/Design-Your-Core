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

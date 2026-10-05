import { isStrongPassword } from '@dyc/core';
import crypto from 'node:crypto';

export const sha256hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/**
 * Contraseñas nuevas (registro, cambio y restablecimiento): las mismas reglas
 * que muestra la web. Entrar con una contraseña antigua más corta sigue funcionando.
 */
export const WEAK_PASSWORD = 'La contraseña necesita al menos 8 caracteres, con una mayúscula, una minúscula y un número.';
export const strongPassword = (p: string) => p.length <= 200 && isStrongPassword(p);

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Código de pareja de 6 caracteres, sin caracteres ambiguos (0/O, 1/I).
export function makeInviteCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += abc[buf[i] % abc.length];
  return out;
}

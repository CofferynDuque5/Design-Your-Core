import crypto from 'node:crypto';

export const sha256hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Código de pareja de 6 caracteres, sin caracteres ambiguos (0/O, 1/I).
export function makeInviteCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += abc[buf[i] % abc.length];
  return out;
}

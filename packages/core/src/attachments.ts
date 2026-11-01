import type { AttachmentKind, ChatAttachment } from './legacy.js';

/**
 * Archivos que se pueden enviar al Asistente (web y móvil). Las imágenes y los
 * PDF van a Gemini como data: URL; los archivos de texto, como texto. Lo demás
 * (Word, Excel…) no se puede leer: se pide guardarlo como PDF o texto.
 */

export const ATTACH_MAX_FILES = 4;
/** El servidor guarda cada archivo como data: URL de hasta 4 MB de texto (≈3 MB del original). */
export const ATTACH_MAX_BYTES = 3 * 1024 * 1024;
/** Los archivos de texto se cortan a este largo para no gastar la petición entera. */
export const ATTACH_MAX_TEXT = 100_000;
/** Lado mayor al que se reducen las fotos antes de enviarlas. */
export const ATTACH_IMAGE_SIDE = 1600;

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|py|java|c|h|cpp|cs|go|rs|rb|php|swift|kt|sql|sh|ya?ml|toml|ini|log|srt|vtt)$/i;

/** Qué tipo de adjunto es (o null si no se puede leer). */
export function attachmentKind(name: string, mime: string): AttachmentKind | null {
  const m = mime.toLowerCase();
  if (IMAGE_MIMES.includes(m) || (!m && /\.(png|jpe?g|webp|heic|heif)$/i.test(name))) return 'image';
  if (m === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (m.startsWith('text/') || ['application/json', 'application/xml', 'application/x-yaml', 'application/javascript'].includes(m) || TEXT_EXT.test(name)) return 'text';
  return null;
}

/** Comprueba un archivo antes de leerlo; devuelve el motivo si no sirve. */
export function attachmentProblem(file: { name: string; mime: string; size: number }, count: number): string | null {
  if (count >= ATTACH_MAX_FILES) return `Puedes adjuntar hasta ${ATTACH_MAX_FILES} archivos por mensaje.`;
  const kind = attachmentKind(file.name, file.mime);
  if (!kind) return `«${file.name}» no se puede leer. Envía imágenes, PDF o archivos de texto (por ejemplo, guarda el documento como PDF).`;
  // Las fotos se reducen antes de enviarlas, así que pueden ser más grandes.
  if (kind !== 'image' && file.size > ATTACH_MAX_BYTES) return `«${file.name}» pesa ${formatBytes(file.size)}; el máximo es ${formatBytes(ATTACH_MAX_BYTES)}.`;
  if (kind === 'image' && file.size > 25 * 1024 * 1024) return `«${file.name}» es demasiado grande.`;
  return null;
}

/** «2,4 MB», «830 KB», «12 bytes». */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} ${n === 1 ? 'byte' : 'bytes'}`;
  const fmt = (v: number) => new Intl.NumberFormat('es', { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v);
  if (n < 1024 * 1024) return `${fmt(n / 1024)} KB`;
  return `${fmt(n / 1024 / 1024)} MB`;
}

/** Recorta el texto de un archivo a ATTACH_MAX_TEXT. */
export const clipAttachmentText = (t: string) => (t.length > ATTACH_MAX_TEXT ? `${t.slice(0, ATTACH_MAX_TEXT)}\n\n[… archivo recortado]` : t);

/** Id nuevo para guardar el archivo en /api/images. */
export const attachmentRef = (random: string) => `ai_${random.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}`;

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

/** Contenido de un mensaje con adjuntos en el formato de la API compatible con OpenAI. */
export function userContent(content: string, attachments: ChatAttachment[] | undefined): string | Part[] {
  if (!attachments?.length) return content;
  const parts: Part[] = [];
  for (const a of attachments) {
    if (a.kind === 'text') parts.push({ type: 'text', text: `Archivo adjunto «${a.name}»:\n\n${a.text ?? ''}` });
    else if (a.data) parts.push({ type: 'image_url', image_url: { url: a.data } });
    else parts.push({ type: 'text', text: `[Adjunto «${a.name}»: ya no está disponible en esta conversación]` });
  }
  parts.push({ type: 'text', text: content || (attachments.length === 1 ? 'Te envío este archivo.' : 'Te envío estos archivos.') });
  return parts;
}

/** El adjunto sin la data: URL, para guardarlo en el historial. */
export const storedAttachment = ({ data: _data, ...a }: ChatAttachment): ChatAttachment => a;

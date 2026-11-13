import { ATTACH_IMAGE_SIDE, attachmentKind, attachmentRef, clipAttachmentText, type ChatAttachment } from '@dyc/core';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { compressImage } from './images';
import { newId } from './legacy';

/**
 * Archivos del Asistente y de Emprendimientos. Se guardan en la nube con
 * /api/images como data: URL (el mismo almacén que las imágenes de las notas).
 */

/** Mismo límite que la API (4 MB de texto por archivo). */
const MAX_DATA_URL = 4 * 1024 * 1024;

export const readDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(file);
  });

const readText = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    r.readAsText(file);
  });

/** Lee un archivo elegido para el Asistente (las fotos se reducen antes). */
export async function readAttachment(file: File): Promise<ChatAttachment> {
  const kind = attachmentKind(file.name, file.type);
  if (!kind) throw new Error(`«${file.name}» no se puede leer.`);
  const base = { name: file.name.slice(0, 200), mime: file.type || (kind === 'pdf' ? 'application/pdf' : 'text/plain'), kind, size: file.size, ref: '' };
  if (kind === 'text') return { ...base, text: clipAttachmentText(await readText(file)) };
  if (kind === 'image') return { ...base, mime: 'image/jpeg', data: await compressImage(file, ATTACH_IMAGE_SIDE, 0.8) };
  return { ...base, data: await readDataUrl(file) };
}

/** Sube un archivo (data: URL) y devuelve su id. */
export async function uploadFile(dataUrl: string, prefix: 'ai' | 'vf'): Promise<string> {
  if (dataUrl.length > MAX_DATA_URL) throw new Error('El archivo es demasiado grande (máximo 3 MB).');
  const id = prefix === 'ai' ? attachmentRef(newId()) : `vf_${newId().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}`;
  const res = await api.legacy.uploadImages({ [id]: dataUrl });
  if (res.count !== 1) throw new Error('No se pudo guardar el archivo. Inténtalo de nuevo.');
  return id;
}

/** Borra archivos de la nube; si falla no pasa nada (solo ocupan espacio). */
export const deleteFiles = (ids: string[]) => (ids.length ? api.legacy.deleteImages(ids).catch(() => undefined) : Promise.resolve(undefined));

/** Descarga archivos guardados por id: { id: dataURL }. */
export function useFiles(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({ queryKey: ['legacy-images', sorted], queryFn: () => api.legacy.images(sorted), enabled: sorted.length > 0, staleTime: Infinity });
}

/** Guarda en el dispositivo un archivo descargado. */
export function saveDataUrl(dataUrl: string, name: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name || 'archivo';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

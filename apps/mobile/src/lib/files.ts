import { ATTACH_IMAGE_SIDE, attachmentKind, attachmentRef, clipAttachmentText, type ChatAttachment } from '@dyc/core';
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { api } from './api';
import { newId } from './legacy';

/**
 * Fotos y archivos del Asistente y de Emprendimientos en el móvil. Se guardan
 * en la nube con /api/images como data: URL, igual que en la web.
 */

export interface PickedFile {
  name: string;
  mime: string;
  size: number;
  /** data: URL (imágenes y archivos) */
  data: string;
  /** Contenido de un archivo de texto, si se pidió leerlo así. */
  text?: string;
}

const MAX_DATA_URL = 4 * 1024 * 1024;

/** Elige fotos de la galería y las reduce a JPEG (lado mayor `side`). */
export async function pickImages(max: number, side = ATTACH_IMAGE_SIDE): Promise<PickedFile[]> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: max > 1, selectionLimit: max, quality: 1 });
  if (r.canceled) return [];
  const out: PickedFile[] = [];
  for (const a of r.assets.slice(0, max)) {
    const ctx = ImageManipulator.manipulate(a.uri);
    if (Math.max(a.width, a.height) > side) ctx.resize(a.width >= a.height ? { width: side } : { height: side });
    const img = await (await ctx.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
    const data = `data:image/jpeg;base64,${img.base64 ?? ''}`;
    out.push({ name: a.fileName ?? 'foto.jpg', mime: 'image/jpeg', size: a.fileSize ?? Math.round((img.base64?.length ?? 0) * 0.75), data });
  }
  return out;
}

/** Elige archivos (PDF, texto, hojas de cálculo…). Devuelve su información sin leerlos. */
export async function pickDocuments(): Promise<DocumentPicker.DocumentPickerAsset[]> {
  const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  return r.canceled ? [] : r.assets;
}

const blobDataUrl = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(b);
  });

/** Lee un archivo elegido como data: URL. */
export async function readDocument(a: DocumentPicker.DocumentPickerAsset): Promise<string> {
  const mime = a.mimeType || 'application/octet-stream';
  if (Platform.OS === 'web') return blobDataUrl(a.file ?? (await (await fetch(a.uri)).blob()));
  return `data:${mime};base64,${await new File(a.uri).base64()}`;
}

async function readDocumentText(a: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') return (a.file ?? (await (await fetch(a.uri)).blob())).text();
  return new File(a.uri).text();
}

/** Un archivo elegido, listo para enviarlo al Asistente. */
export async function documentAttachment(a: DocumentPicker.DocumentPickerAsset): Promise<ChatAttachment> {
  const kind = attachmentKind(a.name, a.mimeType ?? '');
  if (!kind) throw new Error(`«${a.name}» no se puede leer.`);
  const base = { name: a.name.slice(0, 200), mime: a.mimeType || (kind === 'pdf' ? 'application/pdf' : 'text/plain'), kind, size: a.size ?? 0, ref: '' };
  if (kind === 'text') return { ...base, text: clipAttachmentText(await readDocumentText(a)) };
  return { ...base, data: await readDocument(a) };
}

/** Sube un archivo (data: URL) y devuelve su id. */
export async function uploadFile(dataUrl: string, prefix: 'ai' | 'vf'): Promise<string> {
  if (dataUrl.length > MAX_DATA_URL) throw new Error('El archivo es demasiado grande (máximo 3 MB).');
  const id = prefix === 'ai' ? attachmentRef(newId()) : `vf_${newId().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}`;
  const res = await api.legacy.uploadImages({ [id]: dataUrl });
  if (res.count !== 1) throw new Error('No se pudo guardar el archivo. Inténtalo de nuevo.');
  return id;
}

export const deleteFiles = (ids: string[]) => (ids.length ? api.legacy.deleteImages(ids).catch(() => undefined) : Promise.resolve(undefined));

/** Descarga archivos guardados por id: { id: dataURL }. */
export function useFiles(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({ queryKey: ['legacy-images', sorted], queryFn: () => api.legacy.images(sorted), enabled: sorted.length > 0, staleTime: Infinity });
}

/** Abre un archivo guardado: en el teléfono, con el menú de compartir (Archivos, WhatsApp, otra app…). */
export async function openFile(ref: string, name: string): Promise<void> {
  const data = (await api.legacy.images([ref])).images[ref];
  if (!data) throw new Error('El archivo no está disponible.');
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = data;
    a.download = name || 'archivo';
    a.click();
    return;
  }
  const comma = data.indexOf(',');
  const mime = /^data:([^;,]+)/.exec(data)?.[1] ?? 'application/octet-stream';
  const file = new File(Paths.cache, (name || 'archivo').replace(/[\\/:*?"<>|]/g, '_'));
  file.write(data.slice(comma + 1), { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
}

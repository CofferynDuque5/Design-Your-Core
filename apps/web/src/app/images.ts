import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { ImageResolver } from '../lib/markdown';
import { api } from './api';
import { newId } from './legacy';

/**
 * Imágenes de las notas y cajitas, compatibles con la app anterior: en el
 * texto van como `coreimg:<id>` y se guardan en la nube con /api/images (la
 * app anterior las descarga de ahí a su navegador). También se aceptan las
 * incrustadas en base64 que dejaba la app anterior.
 */

export const CORE_IMG = /coreimg:([A-Za-z0-9_-]{1,80})/g;
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i;
/** Mismo límite que la API (4 MB por imagen). */
const MAX_BYTES = 4 * 1024 * 1024;

/** Imágenes subidas en esta visita: se ven al momento, sin volver a descargarlas. */
const uploaded = new Map<string, string>();

export const coreImageIds = (text: string) => Array.from(new Set(Array.from(text.matchAll(CORE_IMG), (m) => m[1])));

/** Carga de la nube las imágenes `coreimg:` de un texto y devuelve con qué mostrarlas. */
export function useCoreImages(text: string): ImageResolver {
  const ids = useMemo(() => coreImageIds(text).filter((id) => !uploaded.has(id)).slice(0, 100), [text]);
  const cloud = useQuery({ queryKey: ['legacy-images', ids], queryFn: () => api.legacy.images(ids), enabled: ids.length > 0, staleTime: Infinity });
  const found = cloud.data?.images;
  const settled = cloud.isSuccess || cloud.isError;
  return useCallback(
    (ref: string) => {
      if (ref.startsWith('data:')) return DATA_IMAGE.test(ref) ? ref : null;
      const id = ref.slice('coreimg:'.length);
      const src = uploaded.get(id) ?? found?.[id];
      if (src) return DATA_IMAGE.test(src) ? src : null;
      return settled ? null : undefined;
    },
    [found, settled],
  );
}

/** Reduce la imagen a JPEG de 1400 px como máximo y calidad 0,72, como la app anterior. */
export async function compressImage(file: Blob, max = 1400, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen. Prueba con un JPG o PNG.'));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Este navegador no puede preparar la imagen.');
    // Fondo blanco: las transparencias de un PNG no se vuelven negras en JPEG.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sube una imagen ya comprimida y devuelve su id para escribir `coreimg:<id>`. */
export async function uploadImage(dataUrl: string): Promise<string> {
  if (dataUrl.length > MAX_BYTES) throw new Error('La imagen es demasiado grande (máximo 4 MB después de reducirla).');
  const id = newId();
  const res = await api.legacy.uploadImages({ [id]: dataUrl });
  if (res.count !== 1) throw new Error('No se pudo guardar la imagen. Inténtalo de nuevo.');
  uploaded.set(id, dataUrl);
  return id;
}

import { coreImageIds, DATA_IMAGE } from '@dyc/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api } from './api';

/**
 * Dirección de una imagen de una nota: el texto para `source.uri`, `null` si
 * no está disponible o `undefined` mientras se carga (igual que en la web).
 */
export type ImageResolver = (ref: string) => string | null | undefined;

/**
 * Imágenes de las notas de la app anterior: `coreimg:<id>` se lee de la nube
 * (/api/images/fetch) y las incrustadas en base64 se muestran tal cual. Solo
 * se aceptan formatos de imagen de mapa de bits. Subir imágenes no está en el móvil.
 */
export function useCoreImages(text: string): ImageResolver {
  const ids = useMemo(() => coreImageIds(text).slice(0, 100), [text]);
  const cloud = useQuery({ queryKey: ['legacy-images', ids], queryFn: () => api.legacy.images(ids), enabled: ids.length > 0, staleTime: Infinity });
  const found = cloud.data?.images;
  const settled = cloud.isSuccess || cloud.isError;
  return useCallback(
    (ref: string) => {
      if (ref.startsWith('data:')) return DATA_IMAGE.test(ref) ? ref : null;
      const src = found?.[ref.slice('coreimg:'.length)];
      if (src) return DATA_IMAGE.test(src) ? src : null;
      return settled ? null : undefined;
    },
    [found, settled],
  );
}

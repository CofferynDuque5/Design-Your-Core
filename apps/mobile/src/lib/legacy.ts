import {
  applyLegacyOp,
  legacyList,
  newLegacyId,
  type LegacyData,
  type LegacyItems,
  type LegacyKey,
  type LegacyOp,
  type LegacyPatch,
} from '@dyc/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { errorMessage } from '../components/ui';
import { api } from './api';
import { useToast } from './toast';

/**
 * Datos de la app anterior (un documento JSON por persona), igual que en la
 * web: una sola consulta para todas las herramientas y para «Más», y cambios
 * elemento a elemento por /api/v2/modules que se ven al instante.
 */
export const LEGACY_QUERY = ['legacy'] as const;
type Legacy = { data: LegacyData; updatedAt: string | null };

export const useLegacyData = () => useQuery({ queryKey: LEGACY_QUERY, queryFn: api.modules.get, staleTime: 60_000 });

/** Lista de una clave con la defensa de la app anterior (`x || []`). */
export function useLegacyList<K extends LegacyKey>(data: LegacyData | undefined, key: K): Array<LegacyItems[K]> {
  return useMemo(() => legacyList(data, key), [data, key]);
}

/** Id nuevo como en la app anterior (React Native no siempre tiene `crypto.randomUUID`). */
export const newId = newLegacyId;

function send<K extends LegacyKey>(key: K, op: LegacyOp<K>): Promise<{ updatedAt: string }> {
  switch (op.type) {
    case 'add':
      return api.modules.add(key, op.item);
    case 'update':
      return api.modules.update(key, op.id, op.patch);
    case 'remove':
      return api.modules.remove(key, op.id);
    case 'reorder':
      return api.modules.reorder(key, op.ids);
  }
}

/** Acciones sobre una clave: se ven al instante y se deshacen con un aviso si la API falla. */
export function useModule<K extends LegacyKey>(key: K) {
  const qc = useQueryClient();
  const toast = useToast();
  const { mutate } = useMutation({
    mutationKey: ['legacy', key],
    // En orden: crear algo y marcarlo enseguida no debe llegar al revés al servidor.
    scope: { id: 'legacy' },
    mutationFn: (op: LegacyOp<K>) => send(key, op),
    onMutate: async (op) => {
      await qc.cancelQueries({ queryKey: LEGACY_QUERY });
      const prev = qc.getQueryData<Legacy>(LEGACY_QUERY);
      if (prev) qc.setQueryData<Legacy>(LEGACY_QUERY, { ...prev, data: applyLegacyOp(prev.data, key, op) });
      return { prev };
    },
    onError: (e, _op, ctx) => {
      if (ctx?.prev) qc.setQueryData(LEGACY_QUERY, ctx.prev);
      toast(errorMessage(e), { tone: 'error' });
    },
    onSettled: () => {
      // Se recarga solo cuando termina el último cambio en vuelo.
      if (qc.isMutating({ mutationKey: ['legacy'] }) <= 1) return qc.invalidateQueries({ queryKey: LEGACY_QUERY });
    },
  });
  return useMemo(
    () => ({
      add: (item: LegacyItems[K]) => mutate({ type: 'add', item }),
      update: (id: string, patch: LegacyPatch<K>) => mutate({ type: 'update', id, patch }),
      remove: (id: string) => mutate({ type: 'remove', id }),
      reorder: (ids: string[]) => mutate({ type: 'reorder', ids }),
    }),
    [mutate],
  );
}

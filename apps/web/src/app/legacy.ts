import { FOCUS_MAX, LEGACY_CHILDREN, legacyList, mergeLegacyItem, reorderById, type LegacyData, type LegacyItems, type LegacyKey, type LegacyPatch } from '@dyc/core';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { errorMessage } from '../components/States';
import { api } from './api';
import { useToast } from './toast';

/**
 * Datos de la app anterior (un documento JSON por persona). Una sola consulta
 * para todas las herramientas y para «Más»; los cambios van elemento a
 * elemento por /api/v2/modules y se ven al instante (optimistas).
 */
export const LEGACY_QUERY = ['legacy'] as const;
type Legacy = { data: LegacyData; updatedAt: string | null };

export const useLegacyData = () => useQuery({ queryKey: LEGACY_QUERY, queryFn: api.modules.get, staleTime: 60_000 });

/** Lista de una clave con la defensa de la app anterior (`x || []`). */
export function useLegacyList<K extends LegacyKey>(data: LegacyData | undefined, key: K): Array<LegacyItems[K]> {
  return useMemo(() => legacyList(data, key), [data, key]);
}

/** Id de un tema, hito o paso: randomUUID o "x" + 7 caracteres, como la app anterior. */
export function newSubId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `x${Math.random().toString(36).slice(2, 9)}`;
}

/** Id nuevo como en la app anterior. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

type Op<K extends LegacyKey> =
  | { type: 'add'; item: LegacyItems[K] }
  | { type: 'update'; id: string; patch: LegacyPatch<K> }
  | { type: 'remove'; id: string }
  | { type: 'reorder'; ids: string[] };

/** Aplica el cambio en la caché igual que lo hará el servidor. */
function apply<K extends LegacyKey>(data: LegacyData, key: K, op: Op<K>): LegacyData {
  const list = legacyList(data, key) as Array<LegacyItems[K]>;
  switch (op.type) {
    case 'add':
      return { ...data, [key]: key === 'focus' ? [op.item, ...list].slice(0, FOCUS_MAX) : [...list, op.item] };
    case 'update':
      return { ...data, [key]: list.map((x) => (x.id === op.id ? mergeLegacyItem(key, x, op.patch as Record<string, unknown>) : x)) };
    case 'remove': {
      // Pendiente → subtareas y cuaderno → cajitas se borran juntos, como en el servidor.
      const child = LEGACY_CHILDREN[key];
      return {
        ...data,
        [key]: list.filter((x) => x.id !== op.id),
        ...(child ? { [child.key]: legacyList(data, child.key).filter((s) => (s as unknown as Record<string, unknown>)[child.field] !== op.id) } : {}),
      };
    }
    case 'reorder':
      return { ...data, [key]: reorderById(list, op.ids) };
  }
}

function send<K extends LegacyKey>(key: K, op: Op<K>): Promise<{ updatedAt: string }> {
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
  const m = useMutation({
    mutationKey: ['legacy', key],
    // En orden: crear algo y marcarlo enseguida no debe llegar al revés al servidor.
    scope: { id: 'legacy' },
    mutationFn: (op: Op<K>) => send(key, op),
    onMutate: async (op) => {
      await qc.cancelQueries({ queryKey: LEGACY_QUERY });
      const prev = qc.getQueryData<Legacy>(LEGACY_QUERY);
      if (prev) qc.setQueryData<Legacy>(LEGACY_QUERY, { ...prev, data: apply(prev.data, key, op) });
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
  const { mutate } = m;
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

/** Pide confirmación al recargar o cerrar mientras quedan cambios sin guardar (el navegador los cancelaría). */
export function warnBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  // Navegadores antiguos necesitan returnValue para mostrar el aviso.
  e.returnValue = '';
}

/** Mientras la cola de escrituras de la app anterior tenga cambios en vuelo, avisa antes de salir. */
export function useUnsavedGuard() {
  const busy = useIsMutating({ mutationKey: ['legacy'] }) > 0;
  useEffect(() => {
    if (!busy) return;
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [busy]);
}

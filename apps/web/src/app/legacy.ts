import {
  applyLegacyOp,
  legacyWithSaved,
  legacyList,
  legacyObject,
  newLegacyId,
  newLegacySubId,
  type LegacyData,
  type LegacyItems,
  type LegacyKey,
  type LegacyObjectKey,
  type LegacyObjects,
  type LegacyOp,
  type LegacyPatch,
  legacyChangeLabel,
  undoLegacyObjectPatch,
  undoLegacyOp,
  type LegacyUndoStep,
} from '@dyc/core';
import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
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
export const newSubId = newLegacySubId;

/** Id nuevo como en la app anterior. */
export const newId = newLegacyId;

type Op<K extends LegacyKey> = LegacyOp<K>;

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

/**
 * Si algo falló, al terminar el último cambio en vuelo se vuelve a pedir el
 * documento (para quedar igual que el servidor). Si todo salió bien, no.
 */
let reloadAfterSave = false;
function settle(qc: QueryClient) {
  if (qc.isMutating({ mutationKey: ['legacy'] }) > 1 || !reloadAfterSave) return;
  reloadAfterSave = false;
  return qc.invalidateQueries({ queryKey: LEGACY_QUERY });
}

/**
 * Deshace un cambio: aplica los pasos en la copia local y los envía en orden.
 * Si algo falla, se vuelve a pedir el documento para quedar igual que el servidor.
 */
export async function runUndo(qc: QueryClient, steps: LegacyUndoStep[], fail: (e: unknown) => void) {
  for (const s of steps) {
    qc.setQueryData<Legacy>(LEGACY_QUERY, (prev) => prev && { ...prev, data: applyLegacyOp(prev.data, s.key, s.op) });
  }
  try {
    for (const s of steps) await send(s.key, s.op);
  } catch (e) {
    fail(e);
  }
  return qc.invalidateQueries({ queryKey: LEGACY_QUERY });
}

/** Opciones de un cambio: `undo: false` para lo que se guarda solo (avance de un video, notas mientras escribes). */
export type ChangeOpts = { undo?: boolean };

/**
 * Acciones sobre una clave: se ven al instante, se deshacen con un aviso si la
 * API falla y, tras cada cambio hecho a mano, sale «Deshacer» unos segundos.
 */
export function useModule<K extends LegacyKey>(key: K, hook: ChangeOpts = {}) {
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
      if (prev) qc.setQueryData<Legacy>(LEGACY_QUERY, { ...prev, data: applyLegacyOp(prev.data, key, op) });
      return { prev };
    },
    onSuccess: (res, op) => {
      // La copia del servidor sustituye a la optimista; no se recarga todo el documento.
      const item = 'item' in res ? (res.item as LegacyItems[K]) : null;
      qc.setQueryData<Legacy>(LEGACY_QUERY, (prev) => prev && { data: op.type === 'add' || op.type === 'update' ? legacyWithSaved(prev.data, key, item) : prev.data, updatedAt: res.updatedAt ?? prev.updatedAt });
    },
    onError: (e, _op, ctx) => {
      if (ctx?.prev) qc.setQueryData(LEGACY_QUERY, ctx.prev);
      reloadAfterSave = true;
      toast(errorMessage(e), { tone: 'error' });
    },
    onSettled: () => settle(qc),
  });
  const { mutate } = m;
  const undoable = hook.undo !== false;
  return useMemo(() => {
    const run = (op: Op<K>, opts?: ChangeOpts) => {
      const prev = undoable && opts?.undo !== false ? qc.getQueryData<Legacy>(LEGACY_QUERY) : undefined;
      const steps = prev ? undoLegacyOp(prev.data, key, op) : null;
      mutate(op);
      if (steps)
        toast(legacyChangeLabel(op.type), {
          key: 'undo',
          action: {
            label: 'Deshacer',
            run: () => void runUndo(qc, steps, (e) => toast(errorMessage(e), { tone: 'error' })),
          },
        });
    };
    return {
      add: (item: LegacyItems[K], opts?: ChangeOpts) => run({ type: 'add', item }, opts),
      update: (id: string, patch: LegacyPatch<K>, opts?: ChangeOpts) => run({ type: 'update', id, patch }, opts),
      remove: (id: string, opts?: ChangeOpts) => run({ type: 'remove', id }, opts),
      reorder: (ids: string[], opts?: ChangeOpts) => run({ type: 'reorder', ids }, opts),
    };
  }, [mutate, qc, key, toast, undoable]);
}

/** Un objeto del documento (`cycle`, `dayLog`, `budget`) con sus valores por defecto. */
export function useLegacyObject<K extends LegacyObjectKey>(data: LegacyData | undefined, key: K, today?: string): LegacyObjects[K] {
  return useMemo(() => legacyObject(data, key, today), [data, key, today]);
}

/**
 * Cambios en una clave que es un objeto: se fusionan al instante con lo
 * guardado (conservando lo desconocido) y se deshacen con un aviso si la API falla.
 */
export function useModuleObject<K extends LegacyObjectKey>(key: K, hook: ChangeOpts = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { mutate } = useMutation({
    mutationKey: ['legacy', key],
    scope: { id: 'legacy' },
    mutationFn: (patch: Partial<LegacyObjects[K]>) => api.modules.patch(key, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: LEGACY_QUERY });
      const prev = qc.getQueryData<Legacy>(LEGACY_QUERY);
      if (prev) qc.setQueryData<Legacy>(LEGACY_QUERY, { ...prev, data: { ...prev.data, [key]: { ...legacyObject(prev.data, key), ...patch } } });
      return { prev };
    },
    onSuccess: (res) => {
      qc.setQueryData<Legacy>(LEGACY_QUERY, (prev) => prev && { data: { ...prev.data, [key]: res.value }, updatedAt: res.updatedAt ?? prev.updatedAt });
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(LEGACY_QUERY, ctx.prev);
      reloadAfterSave = true;
      toast(errorMessage(e), { tone: 'error' });
    },
    onSettled: () => settle(qc),
  });
  const undoable = hook.undo !== false;
  return useMemo(
    () => ({
      patch: (patch: Partial<LegacyObjects[K]>, opts?: ChangeOpts) => {
        const prev = undoable && opts?.undo !== false ? qc.getQueryData<Legacy>(LEGACY_QUERY) : undefined;
        const back = prev ? undoLegacyObjectPatch(prev.data, key, patch) : null;
        mutate(patch);
        if (back)
          toast(legacyChangeLabel('update'), {
            key: 'undo',
            action: { label: 'Deshacer', run: () => mutate(back) },
          });
      },
    }),
    [mutate, qc, key, toast, undoable],
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

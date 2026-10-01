import type { LegacyData, VaultItem, VaultSecure } from '@dyc/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { errorMessage } from '../components/States';
import { api } from './api';
import { LEGACY_QUERY } from './legacy';
import { useToast } from './toast';

/**
 * Cambios en la bóveda cifrada (`vaultSecure`). Todo llega ya cifrado desde
 * vaultCrypto; aquí solo se aplica en la caché al instante (como el servidor)
 * y se envía en la misma cola que el resto de la app anterior.
 */
export type VaultOp =
  | { type: 'create'; vault: VaultSecure }
  | { type: 'destroy' }
  | { type: 'add'; item: VaultItem }
  | { type: 'update'; item: VaultItem }
  | { type: 'remove'; id: string }
  | { type: 'migrate'; items: VaultItem[]; legacyIds: string[] };

type Legacy = { data: LegacyData; updatedAt: string | null };
type Doc = Record<string, unknown>;

const itemsOf = (d: Doc): VaultItem[] => {
  const v = d.vaultSecure as { items?: unknown } | undefined;
  return v && Array.isArray(v.items) ? (v.items as VaultItem[]) : [];
};
const withItems = (d: Doc, items: VaultItem[]): Doc => (d.vaultSecure ? { ...d, vaultSecure: { ...(d.vaultSecure as object), items } } : d);

function apply(data: LegacyData, op: VaultOp): LegacyData {
  const d = data as Doc;
  switch (op.type) {
    case 'create':
      return { ...d, vaultSecure: op.vault } as LegacyData;
    case 'destroy': {
      const { vaultSecure: _drop, ...rest } = d;
      return rest as LegacyData;
    }
    case 'add':
      return withItems(d, [...itemsOf(d), op.item]) as LegacyData;
    case 'update':
      return withItems(d, itemsOf(d).map((x) => (x.id === op.item.id ? op.item : x))) as LegacyData;
    case 'remove':
      return withItems(d, itemsOf(d).filter((x) => x.id !== op.id)) as LegacyData;
    case 'migrate': {
      const drop = new Set(op.legacyIds);
      const legacy = Array.isArray(d.vault) ? (d.vault as Array<{ id?: unknown }>) : [];
      return { ...withItems(d, [...itemsOf(d), ...op.items]), vault: legacy.filter((x) => !(x && typeof x.id === 'string' && drop.has(x.id))) } as LegacyData;
    }
  }
}

function send(op: VaultOp): Promise<unknown> {
  switch (op.type) {
    case 'create':
      return api.vault.create(op.vault);
    case 'destroy':
      return api.vault.destroy();
    case 'add':
      return api.vault.add(op.item);
    case 'update':
      return api.vault.update(op.item);
    case 'remove':
      return api.vault.remove(op.id);
    case 'migrate':
      return api.vault.migrate(op.items, op.legacyIds);
  }
}

/** Acciones de la bóveda: se ven al instante y se deshacen con un aviso si la API falla. */
export function useVault() {
  const qc = useQueryClient();
  const toast = useToast();
  const { mutateAsync } = useMutation({
    mutationKey: ['legacy', 'vaultSecure'],
    scope: { id: 'legacy' },
    mutationFn: send,
    onMutate: async (op) => {
      await qc.cancelQueries({ queryKey: LEGACY_QUERY });
      const prev = qc.getQueryData<Legacy>(LEGACY_QUERY);
      if (prev) qc.setQueryData<Legacy>(LEGACY_QUERY, { ...prev, data: apply(prev.data, op) });
      return { prev };
    },
    onError: (e, _op, ctx) => {
      if (ctx?.prev) qc.setQueryData(LEGACY_QUERY, ctx.prev);
      toast(errorMessage(e), { tone: 'error' });
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ['legacy'] }) <= 1) return qc.invalidateQueries({ queryKey: LEGACY_QUERY });
    },
  });
  return useMemo(() => {
    // El error ya se avisa y se deshace arriba: aquí solo se dice si salió bien.
    const run = (op: VaultOp) => mutateAsync(op).then(() => true, () => false);
    return {
      create: (vault: VaultSecure) => run({ type: 'create', vault }),
      destroy: () => run({ type: 'destroy' }),
      add: (item: VaultItem) => run({ type: 'add', item }),
      update: (item: VaultItem) => run({ type: 'update', item }),
      remove: (id: string) => run({ type: 'remove', id }),
      migrate: (items: VaultItem[], legacyIds: string[]) => run({ type: 'migrate', items, legacyIds }),
    };
  }, [mutateAsync]);
}

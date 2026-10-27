import { applyVaultOp, type LegacyData, type VaultItem, type VaultOp, type VaultSecure } from '@dyc/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { errorMessage } from '../components/ui';
import { api } from './api';
import { LEGACY_QUERY } from './legacy';
import { useToast } from './toast';

type Legacy = { data: LegacyData; updatedAt: string | null };

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

/** Acciones de la bóveda cifrada, como en la web: se ven al instante y se deshacen con un aviso si la API falla. */
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
      if (prev) qc.setQueryData<Legacy>(LEGACY_QUERY, { ...prev, data: applyVaultOp(prev.data, op) });
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
    const run = (op: VaultOp) => mutateAsync(op).then(
      () => true,
      () => false,
    );
    return {
      create: (vault: VaultSecure) => run({ type: 'create', vault }),
      add: (item: VaultItem) => run({ type: 'add', item }),
      update: (item: VaultItem) => run({ type: 'update', item }),
      remove: (id: string) => run({ type: 'remove', id }),
    };
  }, [mutateAsync]);
}

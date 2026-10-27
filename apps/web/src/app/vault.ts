import { applyVaultOp, type LegacyData, type VaultItem, type VaultOp, type VaultSecure } from '@dyc/core';

export type { VaultOp } from '@dyc/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { errorMessage } from '../components/States';
import { api } from './api';
import { LEGACY_QUERY } from './legacy';
import { useToast } from './toast';

/**
 * Cambios en la bóveda cifrada (`vaultSecure`). Todo llega ya cifrado desde
 * vaultCrypto; aquí solo se aplica en la caché al instante (como el servidor,
 * con `applyVaultOp`) y se envía en la misma cola que el resto de la app anterior.
 */
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

import type { User } from '@dyc/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../components/States';
import { api } from './api';
import { useSession } from './session';
import { useToast } from './toast';

/**
 * Mostrar Ciclo en el menú y en el Calendario. Es `user.showCycle`, el mismo
 * ajuste de la cuenta que usa la app anterior, así que las dos apps coinciden.
 */
export function useShowCycle() {
  const { token, user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['me', token];
  const m = useMutation({
    mutationFn: (showCycle: boolean) => api.auth.updateMe({ showCycle }),
    onMutate: async (showCycle) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<User>(key);
      if (prev) qc.setQueryData<User>(key, { ...prev, showCycle });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast(errorMessage(e), { tone: 'error' });
    },
    onSuccess: (u, showCycle) => {
      qc.setQueryData(key, u);
      toast(showCycle ? 'Ciclo aparece en el menú y en el Calendario.' : 'Ciclo ya no aparece en el menú. Sigue en Más.');
    },
  });
  return { showCycle: !!user?.showCycle, setShowCycle: m.mutate };
}

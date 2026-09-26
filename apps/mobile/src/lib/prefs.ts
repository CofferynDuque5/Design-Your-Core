import type { User } from '@dyc/api-client';
import { useMutation } from '@tanstack/react-query';
import { errorMessage } from '../components/ui';
import { api, auth, useAuth } from './api';
import { useToast } from './toast';

/**
 * Mostrar Ciclo en el menú y en el Calendario. Es `user.showCycle`, el mismo
 * ajuste de la cuenta que usan la web y la app anterior (PATCH /api/v2/me),
 * así que las tres coinciden. Se ve al instante y se deshace si la API falla.
 */
export function useShowCycle() {
  const session = useAuth();
  const toast = useToast();
  const user = session.status === 'signedIn' ? session.user : null;
  const { mutate } = useMutation({
    mutationKey: ['me'],
    mutationFn: (showCycle: boolean) => api.auth.updateMe({ showCycle }),
    onMutate: async (showCycle) => {
      const s = auth.get();
      const prev: User | null = s.status === 'signedIn' ? s.user : null;
      if (prev) await auth.updateUser({ ...prev, showCycle });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) auth.updateUser(ctx.prev);
      toast(errorMessage(e), { tone: 'error' });
    },
    onSuccess: (u, showCycle) => {
      auth.updateUser(u);
      toast(showCycle ? 'Ciclo aparece en el menú y en el Calendario.' : 'Ciclo ya no aparece en el menú. Sigue en Más.');
    },
  });
  return { showCycle: !!user?.showCycle, setShowCycle: mutate };
}

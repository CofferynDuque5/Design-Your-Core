import type { Dashboard } from '@dyc/api-client';
import type { Day } from '@dyc/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../components/ui';
import { api } from './api';
import { useRefresh } from './queries';
import { useToast } from './toast';

/**
 * Marcar un hábito: se ve al instante (optimista) en los paneles en caché y
 * se deshace si la API falla.
 */
export function useToggleHabit() {
  const qc = useQueryClient();
  const refresh = useRefresh();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, date, done }: { id: string; date: Day; done: boolean }) => api.habits.log(id, date, done),
    onMutate: async ({ id, date, done }) => {
      await qc.cancelQueries({ queryKey: ['insights', 'dashboard'] });
      const snapshot = qc.getQueriesData<Dashboard>({ queryKey: ['insights', 'dashboard'] });
      qc.setQueriesData<Dashboard>({ queryKey: ['insights', 'dashboard'] }, (d) =>
        d && d.today === date ? { ...d, todayStatus: { ...d.todayStatus, habits: d.todayStatus.habits.map((h) => (h.id === id ? { ...h, done } : h)) } } : d,
      );
      return { snapshot };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast(errorMessage(e), { tone: 'error' });
    },
    onSettled: () => refresh('habits'),
  });
}

export function useToggleChallenge() {
  const refresh = useRefresh();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, date, done }: { id: string; date: Day; done: boolean }) => api.challenges.log(id, date, done),
    onSuccess: (c) => {
      if (c.doneToday && c.doneDays === c.durationDays) toast(`¡Completaste «${c.title}»!`);
      return refresh('challenges');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
}

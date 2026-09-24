import type { Period } from '@dyc/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, useAuth } from './api';

// Mismas claves que la web: todo lo que cambia datos invalida "insights"
// (panel y recomendaciones), porque las puntuaciones dependen de todo lo demás.
export const keys = {
  profile: ['profile'] as const,
  dashboard: (period: Period, date?: string) => ['insights', 'dashboard', period, date ?? 'today'] as const,
  habits: (archived: boolean) => ['habits', archived] as const,
  challenges: ['challenges'] as const,
  catalog: ['catalog'] as const,
  checkIns: (from?: string, to?: string) => ['checkins', from ?? '', to ?? ''] as const,
};

export function useProfile() {
  const session = useAuth();
  return useQuery({ queryKey: keys.profile, queryFn: api.profile.get, staleTime: 5 * 60_000, enabled: session.status === 'signedIn' });
}

export const useDashboard = (period: Period, date?: string) =>
  useQuery({ queryKey: keys.dashboard(period, date), queryFn: () => api.dashboard(period, date), placeholderData: (prev) => prev });

export const useHabits = (archived = false) => useQuery({ queryKey: keys.habits(archived), queryFn: () => api.habits.list(archived) });

export const useChallenges = () => useQuery({ queryKey: keys.challenges, queryFn: api.challenges.list });

export const useCatalog = () => useQuery({ queryKey: keys.catalog, queryFn: api.challenges.catalog, staleTime: Infinity });

/** Tras un cambio: refresca las vistas que dependen de él. */
export function useRefresh() {
  const qc = useQueryClient();
  return useCallback(
    (...groups: Array<'insights' | 'habits' | 'challenges' | 'checkins' | 'profile'>) =>
      Promise.all(['insights', ...groups].map((g) => qc.invalidateQueries({ queryKey: [g] }))),
    [qc],
  );
}

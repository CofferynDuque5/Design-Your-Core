import type { Day, ToolSignals } from '@dyc/core';
import { useCallback } from 'react';
import { api } from './api';
import { useRefresh } from './queries';

/**
 * Copia al check-in del día lo que registras en una herramienta (agua, sueño,
 * gratitud, minutos de ejercicio) para que cuente en tus pilares sin escribirlo
 * dos veces. Si falla, el check-in lo toma de la herramienta al abrirlo.
 */
export function useSyncCheckIn() {
  const refresh = useRefresh();
  return useCallback(
    (date: Day, patch: { [K in keyof ToolSignals]?: ToolSignals[K] | null }) => {
      if (!Object.keys(patch).length) return;
      api.checkIns
        .save(date, patch)
        .then(() => refresh('checkins'))
        .catch(() => undefined);
    },
    [refresh],
  );
}

/** Minutos de ejercicio de un día según la lista de entrenos (ya con el cambio aplicado). */
export function workoutMinutes(list: Array<{ date: string; minutes: number }>, date: Day): number | null {
  const total = list.filter((w) => w.date === date).reduce((s, w) => s + (Number.isFinite(w.minutes) && w.minutes > 0 ? w.minutes : 0), 0);
  return total > 0 ? Math.min(1440, Math.round(total)) : null;
}

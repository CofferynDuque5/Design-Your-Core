import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Utilidades de las herramientas (Agenda, Horario, Enfoque…). Las funciones
// puras viven en @dyc/core para compartirlas con la app móvil; aquí quedan los hooks.
export { durationLabel, hoursShort, isoDay, layoutLanes, localDayKey, localTime, minutesLabel, money, monthWeeks, nowHours, WEEK_HEAD, type Placed } from '@dyc/core';

/** La hora actual, refrescada cada minuto. */
export function useNow(every = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), every);
    return () => window.clearInterval(t);
  }, [every]);
  return now;
}

/**
 * Texto que se guarda solo mientras escribes (como la app anterior, con una
 * espera corta) y al salir del campo. Mientras hay cambios sin guardar, lo
 * que llega del servidor no pisa lo que estás escribiendo.
 */
export function useAutosave(value: string, save: (v: string) => void, delay = 600) {
  const [draft, setDraft] = useState(value);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (pending.current === null) setDraft(value);
  }, [value]);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const v = pending.current;
    pending.current = null;
    if (v !== null) saveRef.current(v);
  }, []);
  const change = useCallback(
    (v: string) => {
      setDraft(v);
      pending.current = v;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    [delay, flush],
  );
  // Al salir de la página, cambiar de pestaña o cerrar la app se guarda lo pendiente.
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && flush();
    // Al recargar o cerrar con texto sin guardar: se envía y el navegador pide confirmación.
    const unload = (e: BeforeUnloadEvent) => {
      if (pending.current === null) return;
      flush();
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);
  return { draft, change, flush };
}

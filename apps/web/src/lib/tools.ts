import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Utilidades de las herramientas (Agenda, Horario, Enfoque…).

/** 1.5 → "1 h 30 min"; 0.5 → "30 min". */
export function durationLabel(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** 1.25 → "1,3 h" (una cifra decimal, formato español). */
export const hoursShort = (h: number) => `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(h)} h`;

/** Hora local actual en horas decimales. */
export const nowHours = (d = new Date()) => d.getHours() + d.getMinutes() / 60;

/** Día de la semana local, 1 = lunes … 7 = domingo. */
export const isoDay = (d = new Date()) => (d.getDay() === 0 ? 7 : d.getDay());

export interface Placed<T> {
  item: T;
  start: number;
  end: number;
  /** Columna dentro de su grupo de solapes y número de columnas del grupo. */
  lane: number;
  lanes: number;
}

/** Reparte en columnas los elementos que se solapan (como un calendario). */
export function layoutLanes<T>(items: Array<{ item: T; start: number; end: number }>): Array<Placed<T>> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Array<Placed<T>> = [];
  let group: Array<Placed<T>> = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const flush = () => {
    const lanes = laneEnds.length;
    group.forEach((g) => (g.lanes = lanes));
    out.push(...group);
    group = [];
    laneEnds = [];
    groupEnd = -Infinity;
  };
  for (const it of sorted) {
    if (group.length && it.start >= groupEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else laneEnds[lane] = it.end;
    group.push({ ...it, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}

/** "2026-09-25" de una fecha local. */
export const localDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

/** Cantidades sin moneda, como la app anterior (`toLocaleString("es")`): 1234.5 → "1234,5"; 12345 → "12.345". */
export const money = (n: number) => new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(n);

/** 465 → "7 h 45 min". */
export const minutesLabel = (m: number) => durationLabel(m / 60);

/** "HH:MM" de una fecha local. */
export const localTime = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Días de un mes en una cuadrícula de lunes a domingo (null = hueco). */
export function monthWeeks(month: string): Array<Array<string | null>> {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const lead = first === 0 ? 6 : first - 1;
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** Cabecera de la semana en los calendarios: letra visible y nombre completo para lectores. */
export const WEEK_HEAD = [
  ['L', 'lunes'],
  ['M', 'martes'],
  ['X', 'miércoles'],
  ['J', 'jueves'],
  ['V', 'viernes'],
  ['S', 'sábado'],
  ['D', 'domingo'],
] as const;

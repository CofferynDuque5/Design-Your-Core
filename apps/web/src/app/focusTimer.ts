import { FOCUS_MODE_INFO, FOCUS_MODES, utcDayKey, type FocusMode } from '@dyc/core';
import { useSyncExternalStore } from 'react';

/**
 * Temporizador de Enfoque fuera de la página: sigue contando al ir a otra
 * sección o al recargar. Se guarda la hora en que termina (no los segundos
 * que faltan), así el tiempo restante siempre sale de `Date.now()`.
 */
export type FocusStatus = 'idle' | 'running' | 'paused';
export interface FocusTimer {
  mode: FocusMode;
  status: FocusStatus;
  /** Cuándo termina, en ms (solo si corre). */
  endsAt: number;
  /** Lo que falta, en ms (si está en pausa o sin empezar). */
  remaining: number;
  /** Sesiones de enfoque completadas hoy en este ciclo. */
  completed: number;
  day: string;
}

const KEY = 'dyc.focus.timer';
export const focusTotalMs = (m: FocusMode) => FOCUS_MODE_INFO[m].minutes * 60_000;
const initial = (): FocusTimer => ({ mode: 'focus', status: 'idle', endsAt: 0, remaining: focusTotalMs('focus'), completed: 0, day: utcDayKey() });

function load(): FocusTimer {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<FocusTimer> | null;
    if (!raw || !FOCUS_MODES.includes(raw.mode as FocusMode) || !['idle', 'running', 'paused'].includes(raw.status as string)) return initial();
    const t: FocusTimer = {
      mode: raw.mode as FocusMode,
      status: raw.status as FocusStatus,
      endsAt: Number(raw.endsAt) || 0,
      remaining: Math.max(0, Math.min(focusTotalMs(raw.mode as FocusMode), Number(raw.remaining) || 0)),
      completed: Math.max(0, Math.floor(Number(raw.completed) || 0)),
      day: typeof raw.day === 'string' ? raw.day : utcDayKey(),
    };
    if (t.status === 'running' && !t.endsAt) return initial();
    // Un nuevo día empieza un ciclo nuevo (si no hay nada corriendo).
    if (t.day !== utcDayKey() && t.status !== 'running') return { ...t, completed: 0, day: utcDayKey() };
    return t;
  } catch {
    return initial();
  }
}

let state: FocusTimer = typeof window === 'undefined' ? initial() : load();
const listeners = new Set<() => void>();

export function setFocusTimer(next: FocusTimer | ((t: FocusTimer) => FocusTimer)) {
  state = typeof next === 'function' ? next(state) : next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* sin almacenamiento: sigue en memoria */
  }
  listeners.forEach((l) => l());
}

export const getFocusTimer = () => state;

function subscribe(l: () => void) {
  listeners.add(l);
  // Otra pestaña lo cambió.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = load();
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

export const useFocusTimer = () => useSyncExternalStore(subscribe, getFocusTimer, getFocusTimer);

/** Milisegundos que faltan ahora. */
export const focusLeft = (t: FocusTimer, now = Date.now()) => (t.status === 'running' ? Math.max(0, t.endsAt - now) : t.remaining);

/** Para pruebas. */
export function resetFocusTimer() {
  state = initial();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
  listeners.forEach((l) => l());
}

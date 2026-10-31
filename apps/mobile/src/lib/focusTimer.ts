import { FOCUS_MODE_INFO, FOCUS_MODES, nextFocusMode, utcDayKey, type FocusMode } from '@dyc/core';
import * as Notifications from 'expo-notifications';
import { useCallback, useSyncExternalStore } from 'react';
import { newId, useModule } from './legacy';
import { notificationsSupported } from './notifications';
import { storage } from './storage';

/**
 * Temporizador de Enfoque fuera de la pantalla: sigue contando al ir a otra
 * sección o al cerrar la app. Se guarda la hora en que termina, así el tiempo
 * restante siempre sale de `Date.now()`.
 */
export type FocusStatus = 'idle' | 'running' | 'paused';
export interface FocusTimer {
  mode: FocusMode;
  status: FocusStatus;
  endsAt: number;
  remaining: number;
  completed: number;
  day: string;
}

const KEY = 'dyc.focus.timer';
const NOTIFICATION_ID = 'dyc-focus-end';
export const focusTotalMs = (m: FocusMode) => FOCUS_MODE_INFO[m].minutes * 60_000;
const initial = (): FocusTimer => ({ mode: 'focus', status: 'idle', endsAt: 0, remaining: focusTotalMs('focus'), completed: 0, day: utcDayKey() });

export function parseFocusTimer(raw: unknown): FocusTimer {
  const r = (raw ?? {}) as Partial<FocusTimer>;
  if (!FOCUS_MODES.includes(r.mode as FocusMode) || !['idle', 'running', 'paused'].includes(r.status as string)) return initial();
  const t: FocusTimer = {
    mode: r.mode as FocusMode,
    status: r.status as FocusStatus,
    endsAt: Number(r.endsAt) || 0,
    remaining: Math.max(0, Math.min(focusTotalMs(r.mode as FocusMode), Number(r.remaining) || 0)),
    completed: Math.max(0, Math.floor(Number(r.completed) || 0)),
    day: typeof r.day === 'string' ? r.day : utcDayKey(),
  };
  if (t.status === 'running' && !t.endsAt) return initial();
  if (t.day !== utcDayKey() && t.status !== 'running') return { ...t, completed: 0, day: utcDayKey() };
  return t;
}

let state: FocusTimer = initial();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Lo guardado se lee al abrir la app (si no se tocó antes el temporizador).
let touched = false;
storage
  .get(KEY)
  .then((raw) => {
    if (!raw || touched) return;
    state = parseFocusTimer(JSON.parse(raw));
    emit();
  })
  .catch(() => undefined);

export function setFocusTimer(next: FocusTimer | ((t: FocusTimer) => FocusTimer)) {
  touched = true;
  const prev = state;
  state = typeof next === 'function' ? next(state) : next;
  storage.set(KEY, JSON.stringify(state)).catch(() => undefined);
  if (prev.status !== state.status || prev.endsAt !== state.endsAt) void scheduleEnd(state);
  emit();
}

/** Un aviso del teléfono al terminar, si ya diste permiso (no se pide aquí). */
async function scheduleEnd(t: FocusTimer) {
  if (!notificationsSupported) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => undefined);
    if (t.status !== 'running' || t.endsAt <= Date.now()) return;
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: { title: `${FOCUS_MODE_INFO[t.mode].label}: sesión terminada`, body: 'Abre Design Your Core para seguir con la siguiente.', data: { url: '/enfoque' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(t.endsAt) },
    });
  } catch {
    /* sin avisos: el temporizador sigue igual */
  }
}

export const getFocusTimer = () => state;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useFocusTimer = () => useSyncExternalStore(subscribe, getFocusTimer, getFocusTimer);
export const focusLeft = (t: FocusTimer, now = Date.now()) => (t.status === 'running' ? Math.max(0, t.endsAt - now) : t.remaining);

/** Para pruebas. */
export function resetFocusTimer() {
  touched = true;
  state = initial();
  emit();
}

/**
 * Termina la sesión en curso (por tiempo o al saltarla): guarda lo
 * transcurrido si pasó al menos 1 s y pasa al siguiente tipo de sesión.
 */
export function useFocusFinish() {
  const actions = useModule('focus');
  return useCallback(
    (skipped: boolean): { mode: FocusMode; next: FocusMode } => {
      const t = getFocusTimer();
      const ended = t.status === 'running' ? Math.min(Date.now(), t.endsAt) : Date.now();
      const seconds = Math.round((focusTotalMs(t.mode) - focusLeft(t, ended)) / 1000);
      const done = t.mode === 'focus' && !skipped ? t.completed + 1 : t.completed;
      const next = t.mode === 'focus' && skipped ? 'short' : nextFocusMode(t.mode, done);
      setFocusTimer({ mode: next, status: 'idle', endsAt: 0, remaining: focusTotalMs(next), completed: done, day: utcDayKey() });
      if (seconds >= 1) actions.add({ id: newId(), mode: t.mode, seconds, dateKey: utcDayKey(new Date(ended)) });
      return { mode: t.mode, next };
    },
    [actions],
  );
}

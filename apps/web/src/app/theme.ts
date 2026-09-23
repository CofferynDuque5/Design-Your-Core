import { useCallback, useSyncExternalStore } from 'react';
import { read, write } from '../lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'dyc.theme';
const listeners = new Set<() => void>();

function current(): ThemePreference {
  const v = read(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** Aplica la preferencia: "system" deja que decida prefers-color-scheme. */
export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function useTheme(): [ThemePreference, (p: ThemePreference) => void] {
  const pref = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
  );
  const set = useCallback((p: ThemePreference) => {
    write(KEY, p === 'system' ? null : p);
    applyTheme(p);
    listeners.forEach((l) => l());
  }, []);
  return [pref, set];
}

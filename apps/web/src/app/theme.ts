import { useCallback, useSyncExternalStore } from 'react';
import { read, write } from '../lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Tema por defecto: oscuro (negro con lima). Debe coincidir con `data-theme` de <html> en index.html. */
export const DEFAULT_THEME: ThemePreference = 'dark';

const KEY = 'dyc.theme';
const listeners = new Set<() => void>();

function current(): ThemePreference {
  const v = read(KEY);
  return v === 'system' || v === 'light' || v === 'dark' ? v : DEFAULT_THEME;
}

/** Tema guardado en este navegador, o el de por defecto. */
export const storedTheme = current;

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
    // El de por defecto no se guarda: si cambia, quien no eligió nada lo recibe.
    write(KEY, p === DEFAULT_THEME ? null : p);
    applyTheme(p);
    listeners.forEach((l) => l());
  }, []);
  return [pref, set];
}

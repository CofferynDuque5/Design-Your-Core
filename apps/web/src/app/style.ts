import { useCallback, useSyncExternalStore } from 'react';
import { read, write } from '../lib/storage';

/**
 * Estilo visual de la app, independiente del tema claro/oscuro. Se guarda en
 * este navegador (como el tema) y se aplica con `data-style` en <html>; cada
 * estilo es una capa de CSS en styles/estilos/ que solo cambia tokens y unos
 * pocos componentes.
 */
export type StylePreference = 'editorial' | 'minimal' | 'glass' | 'suave';

/**
 * Estilo por defecto. Debe coincidir con `data-style` de <html> en index.html,
 * que es lo que se ve antes de que cargue la app (lo comprueba una prueba).
 */
export const DEFAULT_STYLE: StylePreference = 'editorial';

export const STYLE_OPTIONS: ReadonlyArray<{ value: StylePreference; label: string; hint: string }> = [
  { value: 'editorial', label: 'Editorial', hint: 'Serif y tonos cálidos: el aspecto de siempre.' },
  { value: 'minimal', label: 'Minimalista', hint: 'Casi monocromo, líneas finas y mucho aire.' },
  { value: 'glass', label: 'Cristal (glassmorphism)', hint: 'Capas translúcidas sobre un fondo de color.' },
  { value: 'suave', label: 'Suave', hint: 'Formas redondeadas, tonos pastel y sombras ligeras.' },
];

const KEY = 'dyc.style';
const VALUES = new Set<string>(STYLE_OPTIONS.map((o) => o.value));
const listeners = new Set<() => void>();

export function isStyle(v: unknown): v is StylePreference {
  return typeof v === 'string' && VALUES.has(v);
}

/** Estilo guardado en este navegador, o el de por defecto. */
export function storedStyle(): StylePreference {
  const v = read(KEY);
  return isStyle(v) ? v : DEFAULT_STYLE;
}

export function applyStyle(style: StylePreference): void {
  document.documentElement.dataset.style = style;
}

export function useStyle(): [StylePreference, (s: StylePreference) => void] {
  const style = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    storedStyle,
  );
  const set = useCallback((s: StylePreference) => {
    // El de por defecto no se guarda: si cambia, quien no eligió nada lo recibe.
    write(KEY, s === DEFAULT_STYLE ? null : s);
    applyStyle(s);
    listeners.forEach((l) => l());
  }, []);
  return [style, set];
}

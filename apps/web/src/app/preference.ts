import { useCallback, useSyncExternalStore } from 'react';
import { read, write } from '../lib/storage';

/**
 * Preferencia visual guardada en este navegador (como el tema) y aplicada con
 * un atributo `data-*` en <html>. La usan el estilo, la tipografía y la paleta:
 * cada una es independiente de las demás y del tema claro/oscuro.
 *
 * El valor por defecto no se guarda: si cambia, quien no eligió nada lo recibe.
 */
export interface VisualPreference<T extends string> {
  readonly defaultValue: T;
  /** Valor de la preferencia, si es uno de los conocidos. */
  is(v: unknown): v is T;
  /** Lo guardado en este navegador, o el valor por defecto. */
  stored(): T;
  /** Pone el atributo en <html> (y lo que haga falta, como cargar una fuente). */
  apply(v: T): void;
  /** Valor actual y función para elegir otro (lo guarda y lo aplica al momento). */
  use(): [T, (v: T) => void];
}

export function visualPreference<T extends string>(options: {
  /** Clave de localStorage, p. ej. `dyc.style`. */
  key: string;
  /** Nombre del atributo `data-*` en <html>, en camelCase de `dataset` (p. ej. `style`). */
  attribute: string;
  values: readonly T[];
  defaultValue: T;
  /** Algo más que hacer al aplicarla, además del atributo. */
  onApply?: (v: T) => void;
}): VisualPreference<T> {
  const { key, attribute, defaultValue, onApply } = options;
  const known = new Set<string>(options.values);
  const listeners = new Set<() => void>();

  const is = (v: unknown): v is T => typeof v === 'string' && known.has(v);
  const stored = (): T => {
    const v = read(key);
    return is(v) ? v : defaultValue;
  };
  const apply = (v: T) => {
    document.documentElement.dataset[attribute] = v;
    onApply?.(v);
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };

  function use(): [T, (v: T) => void] {
    const value = useSyncExternalStore(subscribe, stored);
    const set = useCallback((v: T) => {
      write(key, v === defaultValue ? null : v);
      apply(v);
      listeners.forEach((l) => l());
    }, []);
    return [value, set];
  }

  return { defaultValue, is, stored, apply, use };
}

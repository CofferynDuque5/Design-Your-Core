import { visualPreference } from './preference';

/**
 * Paleta de color de la app: el color de marca (botones, enlaces, selección y
 * foco) y un leve tinte de los neutros, independiente del estilo, la
 * tipografía y el tema. Se guarda en este navegador y se aplica con
 * `data-palette` en <html>. Cada paleta tiene su versión clara y oscura para
 * cada estilo en styles/paletas.css; los colores de estado y de los pilares no
 * cambian.
 */
export type PalettePreference = 'azul' | 'salvia' | 'terracota' | 'lavanda' | 'grafito';

/** Paleta por defecto. Debe coincidir con `data-palette` de <html> en index.html. */
export const DEFAULT_PALETTE: PalettePreference = 'azul';

export const PALETTE_OPTIONS: ReadonlyArray<{ value: PalettePreference; label: string; hint: string }> = [
  { value: 'azul', label: 'Azul', hint: 'Azul profundo: el de siempre.' },
  { value: 'salvia', label: 'Salvia', hint: 'Verde salvia, sereno y natural.' },
  { value: 'terracota', label: 'Terracota', hint: 'Arcilla cálida y tierra.' },
  { value: 'lavanda', label: 'Lavanda', hint: 'Violeta y ciruela.' },
  { value: 'grafito', label: 'Grafito', hint: 'Gris grafito con un acento cálido.' },
];

const pref = visualPreference<PalettePreference>({
  key: 'dyc.palette',
  attribute: 'palette',
  values: PALETTE_OPTIONS.map((o) => o.value),
  defaultValue: DEFAULT_PALETTE,
});

export const isPalette = pref.is;
/** Paleta guardada en este navegador, o la de por defecto. */
export const storedPalette = pref.stored;
export const applyPalette = pref.apply;
export const usePalette = pref.use;

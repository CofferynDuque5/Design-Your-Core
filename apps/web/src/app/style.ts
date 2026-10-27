import { visualPreference } from './preference';

/**
 * Estilo visual de la app, independiente del tema claro/oscuro, de la
 * tipografía y de la paleta. Se guarda en este navegador (como el tema) y se
 * aplica con `data-style` en <html>; cada estilo es una capa de CSS en
 * styles/estilos/ que solo cambia tokens y unos pocos componentes.
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

const pref = visualPreference<StylePreference>({
  key: 'dyc.style',
  attribute: 'style',
  values: STYLE_OPTIONS.map((o) => o.value),
  defaultValue: DEFAULT_STYLE,
});

export const isStyle = pref.is;
/** Estilo guardado en este navegador, o el de por defecto. */
export const storedStyle = pref.stored;
export const applyStyle = pref.apply;
export const useStyle = pref.use;

import { visualPreference } from './preference';

/**
 * Tipografía de la app: una pareja de letras para títulos y texto,
 * independiente del estilo, la paleta y el tema. Se guarda en este navegador
 * y se aplica con `data-font` en <html>; las familias se eligen en
 * styles/tipografias.css.
 *
 * Clásica (Newsreader + Figtree) va en el paquete inicial. Las demás se
 * cargan solo cuando alguien las elige (o abre el selector de Perfil, que
 * muestra cada opción en su letra): su CSS va en un trozo aparte y el
 * navegador descarga cada archivo de fuente solo si lo usa.
 */
export type FontPreference = 'clasica' | 'moderna' | 'geometrica' | 'elegante' | 'amable';

/** Tipografía por defecto. Debe coincidir con `data-font` de <html> en index.html. */
export const DEFAULT_FONT: FontPreference = 'clasica';

export const FONT_OPTIONS: ReadonlyArray<{ value: FontPreference; label: string; hint: string }> = [
  { value: 'clasica', label: 'Clásica', hint: 'Newsreader y Figtree: títulos con serif y texto claro.' },
  { value: 'moderna', label: 'Moderna', hint: 'Manrope en todo: limpia y actual.' },
  { value: 'geometrica', label: 'Geométrica', hint: 'Outfit y DM Sans: formas redondas y precisas.' },
  { value: 'elegante', label: 'Elegante', hint: 'Fraunces y Source Sans 3: serif con carácter.' },
  { value: 'amable', label: 'Amable', hint: 'Nunito en todo: redondeada y cercana.' },
];

const loaders: Record<Exclude<FontPreference, 'clasica'>, () => Promise<unknown>> = {
  moderna: () => import('../styles/fuentes/moderna.css'),
  geometrica: () => import('../styles/fuentes/geometrica.css'),
  elegante: () => import('../styles/fuentes/elegante.css'),
  amable: () => import('../styles/fuentes/amable.css'),
};
const loading = new Map<FontPreference, Promise<void>>();

/** Carga (una sola vez) las fuentes de una tipografía. Clásica ya viene en el paquete. */
export function loadFont(font: FontPreference): Promise<void> {
  if (font === 'clasica') return Promise.resolve();
  let p = loading.get(font);
  if (!p) {
    p = loaders[font]().then(
      () => undefined,
      () => {
        // Sin conexión o sin el trozo: se ve la letra de repuesto y se reintenta la próxima vez.
        loading.delete(font);
      },
    );
    loading.set(font, p);
  }
  return p;
}

/** Carga todas: el selector de Perfil enseña cada opción con su letra. */
export function loadAllFonts(): Promise<void> {
  return Promise.all(FONT_OPTIONS.map((o) => loadFont(o.value))).then(() => undefined);
}

const pref = visualPreference<FontPreference>({
  key: 'dyc.font',
  attribute: 'font',
  values: FONT_OPTIONS.map((o) => o.value),
  defaultValue: DEFAULT_FONT,
  onApply: (f) => void loadFont(f),
});

export const isFont = pref.is;
/** Tipografía guardada en este navegador, o la de por defecto. */
export const storedFont = pref.stored;
export const applyFont = pref.apply;
export const useFont = pref.use;

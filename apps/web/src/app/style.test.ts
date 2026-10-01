import { contrast, pillars, type ThemeName } from '@dyc/tokens';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { baseVars, block, over, srcFile, type Vars } from '../test/cssVars';
import { PALETTE_OPTIONS, type PalettePreference } from './palette';
import { applyStyle, DEFAULT_STYLE, STYLE_OPTIONS, storedStyle, useStyle, type StylePreference } from './style';

afterEach(() => {
  delete document.documentElement.dataset.style;
});

describe('preferencia de estilo visual', () => {
  it('sin nada guardado (o con un valor desconocido) usa el de por defecto', () => {
    expect(storedStyle()).toBe(DEFAULT_STYLE);
    localStorage.setItem('dyc.style', 'barroco');
    expect(storedStyle()).toBe('editorial');
  });

  it('elegir un estilo lo guarda en este navegador y lo aplica en <html>', () => {
    const { result } = renderHook(() => useStyle());
    expect(result.current[0]).toBe('editorial');
    act(() => result.current[1]('glass'));
    expect(result.current[0]).toBe('glass');
    expect(localStorage.getItem('dyc.style')).toBe('glass');
    expect(document.documentElement.dataset.style).toBe('glass');
    // Volver al de por defecto no deja nada guardado.
    act(() => result.current[1]('editorial'));
    expect(localStorage.getItem('dyc.style')).toBeNull();
    expect(document.documentElement.dataset.style).toBe('editorial');
  });

  it('lo guardado se aplica al arrancar', () => {
    localStorage.setItem('dyc.style', 'suave');
    applyStyle(storedStyle());
    expect(document.documentElement.dataset.style).toBe('suave');
  });

  it('index.html pinta el estilo por defecto y conoce todos los estilos antes de cargar la app', () => {
    const html = srcFile('../index.html');
    expect(html).toMatch(new RegExp(`<html [^>]*data-style="${DEFAULT_STYLE}"`));
    const list = /\[([^\]]*)\]\.indexOf\(s\)/.exec(html)?.[1] ?? '';
    const inScript = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(inScript).toEqual(STYLE_OPTIONS.map((o) => o.value).sort());
  });
});

// ---------- Contraste de cada estilo con cada paleta (WCAG AA) leyendo sus archivos CSS ----------

const styles = STYLE_OPTIONS.map((o) => o.value).filter((s) => s !== 'editorial') as Exclude<StylePreference, 'editorial'>[];
const css = Object.fromEntries(styles.map((s) => [s, srcFile(`styles/estilos/${s}.css`)])) as Record<(typeof styles)[number], string>;
const paletteCss = srcFile('styles/paletas.css');

/** Variables efectivas: tokens base, el estilo y la paleta encima (Azul es la del estilo, sin cambios). */
function themeVars(style: StylePreference, theme: ThemeName, palette: PalettePreference = 'azul'): Vars {
  const vars = { ...baseVars(theme) };
  if (style !== 'editorial') {
    Object.assign(vars, block(css[style], `:root[data-style='${style}']`));
    if (theme === 'dark') Object.assign(vars, block(css[style], `:root[data-style='${style}'][data-theme='dark']`));
  }
  if (palette !== 'azul') {
    const sel = `:root[data-style='${style}'][data-palette='${palette}']`;
    Object.assign(vars, block(paletteCss, sel));
    if (theme === 'dark') Object.assign(vars, block(paletteCss, `${sel}[data-theme='dark']`));
  }
  return vars;
}

const TEXT = ['--color-ink', '--color-ink-muted', '--color-ink-subtle', '--color-primary'];
const STATES = ['--color-success', '--color-warning', '--color-danger'];
const PILLARS = pillars.map((p) => `--pillar-${p.id}`);

describe.each(styles)('estilo %s', (style) => {
  it('define en oscuro los mismos colores que en claro, igual con el tema del sistema que con el elegido', () => {
    const light = block(css[style], `:root[data-style='${style}']`);
    const media = block(css[style], `:root[data-style='${style}']:not([data-theme='light'])`);
    const forced = block(css[style], `:root[data-style='${style}'][data-theme='dark']`);
    expect(media).toEqual(forced);
    const colorKeys = Object.keys(light).filter((k) => k.startsWith('--color-') || k.startsWith('--pillar-') || k.startsWith('--glass-') || k.startsWith('--minimal-') || k.startsWith('--suave-'));
    for (const k of colorKeys) expect(forced, `${k} falta en oscuro`).toHaveProperty(k);
  });
});

const combos = STYLE_OPTIONS.flatMap((s) => PALETTE_OPTIONS.flatMap((p) => (['light', 'dark'] as const).map((t) => [s.value, p.value, t] as const)));

describe.each(combos)('contraste de %s con la paleta %s en tema %s', (style, palette, theme) => {
  const v = themeVars(style, theme, palette);
  const surfaces = ['--color-bg', '--color-surface', '--color-surface-sunken', '--color-primary-soft'];

  it('el texto se lee sobre fondo, tarjetas y zonas hundidas (4,5:1)', () => {
    for (const t of TEXT) for (const s of surfaces) expect(contrast(v[t], v[s]), `${t} sobre ${s}`).toBeGreaterThanOrEqual(4.5);
  });

  it('botón principal, estados, pilares y foco', () => {
    expect(contrast(v['--color-on-primary'], v['--color-primary'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--color-on-primary'], v['--color-primary-hover']), 'botón principal al pasar el ratón').toBeGreaterThanOrEqual(4.5);
    for (const t of STATES) expect(contrast(v[t], v['--color-surface']), t).toBeGreaterThanOrEqual(4.5);
    for (const p of PILLARS) {
      expect(contrast(v[p], v['--color-surface']), p).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v[p], v[`${p}-soft`]), `${p} sobre su fondo`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v['--color-ink-muted'], v[`${p}-soft`]), `texto secundario sobre ${p}-soft`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v[`${p}-chart`], v['--color-surface']), `${p}-chart`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(v['--color-focus'], v['--color-bg'])).toBeGreaterThanOrEqual(3);
    expect(contrast(v['--color-focus'], v['--color-surface'])).toBeGreaterThanOrEqual(3);
    // Minimalista: el único acento (enlace activo, pestaña activa) se distingue como el foco.
    if (style === 'minimal') for (const s of ['--color-bg', '--color-surface']) expect(contrast(v['--minimal-accent'], v[s]), `acento sobre ${s}`).toBeGreaterThanOrEqual(3);
  });

  if (style !== 'glass') return;

  // Peor caso del cristal: el centro de cada mancha del fondo, sin contar el desenfoque (que aclara u oscurece menos).
  const blobs = [1, 2, 3, 4].map((i) => v[`--glass-blob-${i}`]);

  it('sobre el fondo de manchas, el texto de página se lee', () => {
    for (const blob of blobs) for (const t of TEXT) expect(contrast(v[t], blob), `${t} sobre ${blob}`).toBeGreaterThanOrEqual(4.5);
  });

  it('sobre las tarjetas, barras y diálogos translúcidos, todo el texto se lee', () => {
    for (const blob of blobs) {
      for (const layer of ['--glass-surface', '--glass-surface-strong']) {
        const card = over(v[layer], blob);
        for (const t of [...TEXT, ...STATES, ...PILLARS]) expect(contrast(v[t], card), `${t} sobre ${layer} (${card})`).toBeGreaterThanOrEqual(4.5);
        // Campos y botones secundarios, y el tinte de chips y controles segmentados, encima de la tarjeta.
        for (const control of ['--glass-control', '--glass-tint']) {
          const c = over(v[control], card);
          for (const t of TEXT) expect(contrast(v[t], c), `${t} sobre ${control} en ${layer}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('la barra de pestañas y los diálogos tapan lo que pasa por debajo, aunque sea texto', () => {
    // Chrome no desenfoca lo que hay dentro de otra superficie con backdrop-filter: el peor
    // caso bajo la barra es el propio texto de una tarjeta.
    const behind = over(v['--glass-surface-strong'], v['--color-ink']);
    for (const t of TEXT) expect(contrast(v[t], behind), `${t} sobre la barra con texto debajo`).toBeGreaterThanOrEqual(4.5);
  });

  it('sin backdrop-filter las superficies son opacas y también se leen', () => {
    const fallbackAt = css.glass.indexOf('@supports not');
    const light = block(css.glass, `:root[data-style='glass']`, fallbackAt);
    const dark = block(css.glass, `:root[data-style='glass'][data-theme='dark']`, fallbackAt);
    const f = theme === 'light' ? light : dark;
    for (const layer of ['--glass-surface', '--glass-surface-strong', '--glass-control']) {
      expect(f[layer]).toMatch(/^#[0-9A-F]{6}$/i);
      for (const t of TEXT) expect(contrast(v[t], f[layer]), `${t} sobre ${layer}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { contrast } from '../src/contrast.js';
import { buildCss } from '../src/css.js';
import { color, pillars, type ThemeName } from '../src/tokens.js';

const themes: ThemeName[] = ['light', 'dark'];

// Accesibilidad: WCAG AA pide 4.5:1 para texto normal y 3:1 para elementos gráficos.
describe.each(themes)('contraste en tema %s', (theme) => {
  const c = color[theme];

  it.each([
    ['ink', c.ink],
    ['inkMuted', c.inkMuted],
    ['inkSubtle', c.inkSubtle],
    ['primary', c.primary],
    ['sage', c.sage],
    ['terracotta', c.terracotta],
    ['success', c.success],
    ['warning', c.warning],
    ['danger', c.danger],
  ])('%s se lee sobre el fondo y las tarjetas', (_name, fg) => {
    expect(contrast(fg, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fg, c.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto principal es muy legible', () => {
    expect(contrast(c.ink, c.bg)).toBeGreaterThanOrEqual(12);
  });

  it('el texto sobre el botón principal se lee', () => {
    expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('los estados se leen sobre su fondo suave', () => {
    expect(contrast(c.success, c.successSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.warning, c.warningSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.danger, c.dangerSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it.each<[string, string]>([
    ['surfaceSunken', c.surfaceSunken],
    ['primarySoft', c.primarySoft],
    ...pillars.map((p): [string, string] => [`${p.id}.soft`, p.soft[theme]]),
  ])('el texto secundario se lee también sobre %s', (_name, bg) => {
    expect(contrast(c.inkMuted, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.inkSubtle, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('el anillo de foco se distingue del fondo', () => {
    expect(contrast(c.focus, c.bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(pillars.map((p) => [p.short, p] as const))('el pilar %s sirve como texto y como gráfico', (_n, p) => {
    expect(contrast(p.color[theme], c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.color[theme], c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.color[theme], p.soft[theme])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('pilares', () => {
  it('son seis, con ids únicos', () => {
    expect(pillars).toHaveLength(6);
    expect(new Set(pillars.map((p) => p.id)).size).toBe(6);
  });

  it('sus colores de gráfico se ven sobre las tarjetas', () => {
    // Paleta categórica validada además con el validador de dataviz (banda de
    // luminosidad, croma, separación con daltonismo y visión normal).
    for (const theme of themes) {
      for (const p of pillars) expect(contrast(p.chart[theme], color[theme].surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('se distinguen entre sí', () => {
    // Colores demasiado parecidos confundirían las leyendas de los gráficos.
    for (const theme of themes) {
      for (const key of ['color', 'chart'] as const) {
        expect(new Set(pillars.map((p) => p[key][theme])).size).toBe(6);
      }
    }
  });
});

describe('CSS generado', () => {
  const css = buildCss();

  it('define el tema claro en :root y el oscuro con preferencia y con data-theme', () => {
    expect(css).toContain(':root {');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"]');
  });

  it('incluye colores, pilares y escala', () => {
    expect(css).toContain('--color-primary: #1E3A5F;');
    expect(css).toContain('--pillar-descanso: #2E4D78;');
    expect(css).toContain('--text-body: 1rem;');
    expect(css).toContain('--space-4: 16px;');
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { block, srcFile } from '../test/cssVars';
import { applyPalette, DEFAULT_PALETTE, PALETTE_OPTIONS, storedPalette, usePalette } from './palette';
import { STYLE_OPTIONS } from './style';

// El contraste de cada paleta con cada estilo y tema lo comprueba style.test.ts.

afterEach(() => {
  delete document.documentElement.dataset.palette;
});

describe('preferencia de paleta de color', () => {
  it('sin nada guardado (o con un valor desconocido) usa la de por defecto', () => {
    expect(storedPalette()).toBe(DEFAULT_PALETTE);
    localStorage.setItem('dyc.palette', 'fucsia');
    expect(storedPalette()).toBe(DEFAULT_PALETTE);
  });

  it('elegir una paleta la guarda en este navegador y la aplica en <html>', () => {
    const { result } = renderHook(() => usePalette());
    expect(result.current[0]).toBe(DEFAULT_PALETTE);
    act(() => result.current[1]('salvia'));
    expect(result.current[0]).toBe('salvia');
    expect(localStorage.getItem('dyc.palette')).toBe('salvia');
    expect(document.documentElement.dataset.palette).toBe('salvia');
    // Volver a la de por defecto no deja nada guardado.
    act(() => result.current[1](DEFAULT_PALETTE));
    expect(localStorage.getItem('dyc.palette')).toBeNull();
    expect(document.documentElement.dataset.palette).toBe(DEFAULT_PALETTE);
  });

  it('lo guardado se aplica al arrancar', () => {
    localStorage.setItem('dyc.palette', 'grafito');
    applyPalette(storedPalette());
    expect(document.documentElement.dataset.palette).toBe('grafito');
  });

  it('index.html pinta la paleta por defecto y conoce todas antes de cargar la app', () => {
    const html = srcFile('../index.html');
    expect(html).toMatch(new RegExp(`<html [^>]*data-palette="${DEFAULT_PALETTE}"`));
    const list = /\[([^\]]*)\]\.indexOf\(p\)/.exec(html)?.[1] ?? '';
    expect([...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()).toEqual(PALETTE_OPTIONS.map((o) => o.value).sort());
  });
});

const css = srcFile('styles/paletas.css');
const pairs = STYLE_OPTIONS.flatMap((s) => PALETTE_OPTIONS.filter((p) => p.value !== 'azul').map((p) => [s.value, p.value] as const));

describe.each(pairs)('paleta en el estilo %s: %s', (style, palette) => {
  const sel = `:root[data-style='${style}'][data-palette='${palette}']`;

  it('define en oscuro los mismos colores que en claro, igual con el tema del sistema que con el elegido', () => {
    const light = block(css, sel);
    const media = block(css, `${sel}:not([data-theme='light'])`);
    const forced = block(css, `${sel}[data-theme='dark']`);
    expect(media).toEqual(forced);
    // Lo que el bloque claro cambia se cambia también en oscuro: si no, el valor claro se colaría.
    for (const k of Object.keys(light)) expect(forced, `${k} falta en oscuro`).toHaveProperty(k);
  });

  it('solo cambia la marca, el foco, los neutros y (en Cristal) las manchas del fondo, nunca estados ni pilares', () => {
    const keys = Object.keys(block(css, `${sel}[data-theme='dark']`));
    expect(keys).toContain('--color-focus');
    for (const k of keys) {
      expect(k).toMatch(/^--(color-(primary|primary-hover|primary-soft|on-primary|focus|bg|surface|surface-sunken|surface-raised|line|line-strong)|glass-blob-[1-4]|minimal-accent|suave-card-border)$/);
    }
    if (style === 'minimal') expect(keys.sort()).toEqual(['--color-focus', '--minimal-accent']);
    else expect(keys).toContain('--color-primary');
    if (style === 'glass') for (const i of [1, 2, 3, 4]) expect(keys).toContain(`--glass-blob-${i}`);
  });
});

describe('muestras del selector de color', () => {
  it('hay una por paleta, en claro y en oscuro', () => {
    const app = srcFile('styles/app.css');
    for (const { value } of PALETTE_OPTIONS) {
      expect(app).toContain(`[data-swatch='${value}'] {`);
      expect(app).toContain(`[data-theme='dark'] [data-swatch='${value}'] {`);
      expect(app).toContain(`:root:not([data-theme='light']) [data-swatch='${value}'] {`);
    }
  });
});

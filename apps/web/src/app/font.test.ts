import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { block, srcFile } from '../test/cssVars';
import { applyFont, DEFAULT_FONT, FONT_OPTIONS, loadAllFonts, loadFont, storedFont, useFont } from './font';

afterEach(() => {
  delete document.documentElement.dataset.font;
});

describe('preferencia de tipografía', () => {
  it('sin nada guardado (o con un valor desconocido) usa la de por defecto', () => {
    expect(storedFont()).toBe(DEFAULT_FONT);
    localStorage.setItem('dyc.font', 'comic');
    expect(storedFont()).toBe('clasica');
  });

  it('elegir una tipografía la guarda en este navegador y la aplica en <html>', () => {
    const { result } = renderHook(() => useFont());
    expect(result.current[0]).toBe('clasica');
    act(() => result.current[1]('elegante'));
    expect(result.current[0]).toBe('elegante');
    expect(localStorage.getItem('dyc.font')).toBe('elegante');
    expect(document.documentElement.dataset.font).toBe('elegante');
    // Volver a la de por defecto no deja nada guardado.
    act(() => result.current[1]('clasica'));
    expect(localStorage.getItem('dyc.font')).toBeNull();
    expect(document.documentElement.dataset.font).toBe('clasica');
  });

  it('lo guardado se aplica al arrancar', () => {
    localStorage.setItem('dyc.font', 'amable');
    applyFont(storedFont());
    expect(document.documentElement.dataset.font).toBe('amable');
  });

  it('las fuentes se cargan una sola vez, y la clásica ya viene en el paquete', async () => {
    await expect(loadFont('clasica')).resolves.toBeUndefined();
    const first = loadFont('moderna');
    expect(loadFont('moderna')).toBe(first);
    await expect(first).resolves.toBeUndefined();
    await expect(loadAllFonts()).resolves.toBeUndefined();
  });

  it('index.html pinta la tipografía por defecto y conoce todas antes de cargar la app', () => {
    const html = srcFile('../index.html');
    expect(html).toMatch(new RegExp(`<html [^>]*data-font="${DEFAULT_FONT}"`));
    const list = /\[([^\]]*)\]\.indexOf\(f\)/.exec(html)?.[1] ?? '';
    expect([...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()).toEqual(FONT_OPTIONS.map((o) => o.value).sort());
  });
});

describe('tipografías en CSS', () => {
  const css = srcFile('styles/tipografias.css');
  const others = FONT_OPTIONS.map((o) => o.value).filter((f) => f !== DEFAULT_FONT);

  it.each(others)('%s define la letra de títulos y de texto, el grosor de los títulos y su muestra', (font) => {
    const vars = block(css, `:root[data-font='${font}']`);
    expect(vars['--font-display']).toMatch(/^var\(--font-stack-/);
    expect(vars['--font-sans']).toMatch(/^var\(--font-stack-/);
    expect(vars['--weight-display']).toMatch(/^var\(--weight-/);
    expect(css).toContain(`[data-font-option='${font}'] b {`);
    // Sus @font-face van aparte, con solo pesos latinos de @fontsource.
    const faces = srcFile(`styles/fuentes/${font}.css`);
    const imports = [...faces.matchAll(/@import '([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) expect(i).toMatch(/^@fontsource\/[a-z0-9-]+\/latin-\d00(-italic)?\.css$/);
  });

  it('cada pila de letras termina en una genérica de repuesto', () => {
    const root = block(css, ':root');
    for (const [k, v] of Object.entries(root)) if (k.startsWith('--font-stack-')) expect(v, k).toMatch(/, (serif|sans-serif)$/);
  });
});

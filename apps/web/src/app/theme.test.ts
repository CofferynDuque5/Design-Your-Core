import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { srcFile } from '../test/cssVars';
import { applyTheme, DEFAULT_THEME, storedTheme, useTheme } from './theme';

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('preferencia de tema', () => {
  it('sin nada guardado (o con un valor desconocido) usa el oscuro', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(storedTheme()).toBe('dark');
    localStorage.setItem('dyc.theme', 'sepia');
    expect(storedTheme()).toBe('dark');
  });

  it('«Sistema» se guarda y deja decidir al dispositivo; volver al oscuro no guarda nada', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('dark');
    act(() => result.current[1]('system'));
    expect(localStorage.getItem('dyc.theme')).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    act(() => result.current[1]('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => result.current[1]('dark'));
    expect(localStorage.getItem('dyc.theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('lo guardado se aplica al arrancar', () => {
    localStorage.setItem('dyc.theme', 'light');
    applyTheme(storedTheme());
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('index.html pinta el tema por defecto antes de cargar la app', () => {
    const html = srcFile('../index.html');
    expect(html).toMatch(new RegExp(`<html [^>]*data-theme="${DEFAULT_THEME}"`));
    expect(html).toContain("else if (t === 'system') delete document.documentElement.dataset.theme;");
  });
});

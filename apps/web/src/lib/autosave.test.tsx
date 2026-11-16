import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './tools';

describe('useAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('no pierde lo escrito cuando llega tarde la respuesta de un guardado anterior', () => {
    const save = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useAutosave(value, save, 500), { initialProps: { value: '' } });
    act(() => result.current.change('A'));
    act(() => void vi.advanceTimersByTime(500));
    act(() => result.current.change('A\nB'));
    act(() => void vi.advanceTimersByTime(500));
    expect(save.mock.calls.map((c) => c[0])).toEqual(['A', 'A\nB']);
    // El servidor devuelve primero el guardado viejo y luego el nuevo.
    rerender({ value: 'A' });
    expect(result.current.draft).toBe('A\nB');
    rerender({ value: 'A\nB' });
    expect(result.current.draft).toBe('A\nB');
    // Un cambio hecho en otra pantalla sí se muestra.
    rerender({ value: 'Otro' });
    expect(result.current.draft).toBe('Otro');
  });
});

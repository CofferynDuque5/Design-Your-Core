import { describe, expect, it } from 'vitest';
import { fromCheckIn, toPayload } from '../pages/CheckIn';
import { countItems } from '../pages/More';
import { suggestedPillar } from '../pages/Onboarding';
import { shiftPeriod } from '../pages/Progress';

describe('lógica de pantallas', () => {
  it('sugiere el primer reto en el pilar de enfoque más bajo', () => {
    expect(suggestedPillar(['descanso', 'enfoque'], { descanso: 4, enfoque: 2 })).toBe('enfoque');
    expect(suggestedPillar(['relaciones'], {})).toBe('relaciones');
    expect(suggestedPillar([], { alimentacion: 1 })).toBe('alimentacion');
  });

  it('el check-in envía los vacíos como null para borrarlos', () => {
    const v = fromCheckIn(undefined);
    expect(Object.values(v).every((x) => x === null)).toBe(true);
    expect(toPayload({ ...v, mood: 4, note: '   ', gratitude: ' mi familia ' })).toMatchObject({ mood: 4, note: null, gratitude: 'mi familia', sleepHours: null });
  });

  it('se mueve al periodo anterior y siguiente', () => {
    expect(shiftPeriod('week', '2026-09-23', -1)).toBe('2026-09-20');
    expect(shiftPeriod('week', '2026-09-23', 1)).toBe('2026-09-28');
    expect(shiftPeriod('month', '2026-09-23', -1)).toBe('2026-08-31');
    expect(shiftPeriod('day', '2026-09-01', -1)).toBe('2026-08-31');
  });

  it('cuenta los datos de la app anterior sin fallar con formas raras', () => {
    expect(countItems({ tasks: [1, 2], todos: [3], notes: 'x' }, ['tasks', 'todos', 'notes'])).toBe(3);
    expect(countItems({}, ['vault'])).toBe(0);
  });
});

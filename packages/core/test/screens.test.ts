import { describe, expect, it } from 'vitest';
import { fromCheckIn, parseNumber, toCheckInPayload } from '../src/checkin.js';
import { suggestedPillar } from '../src/challenges.js';
import { shiftPeriod } from '../src/dates.js';

// Lógica de pantallas que comparten la web y el móvil.
describe('lógica compartida de pantallas', () => {
  it('sugiere el primer reto en el pilar de enfoque más bajo', () => {
    expect(suggestedPillar(['descanso', 'enfoque'], { descanso: 4, enfoque: 2 })).toBe('enfoque');
    expect(suggestedPillar(['relaciones'], {})).toBe('relaciones');
    expect(suggestedPillar([], { alimentacion: 1 })).toBe('alimentacion');
  });

  it('el check-in envía los vacíos como null para borrarlos', () => {
    const v = fromCheckIn(undefined);
    expect(Object.values(v).every((x) => x === null)).toBe(true);
    expect(toCheckInPayload({ ...v, mood: 4, note: '   ', gratitude: ' mi familia ' })).toMatchObject({ mood: 4, note: null, gratitude: 'mi familia', sleepHours: null });
    expect(fromCheckIn({ mood: 3, note: 'hola' })).toMatchObject({ mood: 3, note: 'hola', energy: null });
  });

  it('lee números escritos a mano', () => {
    expect(parseNumber('7,5')).toBe(7.5);
    expect(parseNumber(' ')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });

  it('se mueve al periodo anterior y siguiente', () => {
    expect(shiftPeriod('week', '2026-09-23', -1)).toBe('2026-09-20');
    expect(shiftPeriod('week', '2026-09-23', 1)).toBe('2026-09-28');
    expect(shiftPeriod('month', '2026-09-23', -1)).toBe('2026-08-31');
    expect(shiftPeriod('day', '2026-09-01', -1)).toBe('2026-08-31');
  });
});

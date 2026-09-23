import { describe, expect, it } from 'vitest';
import { addDays, daysIn, diffDays, isDay, isoWeekday, periodRange, previousRange, todayIn } from '../src/dates.js';

describe('fechas', () => {
  it('valida días reales', () => {
    expect(isDay('2026-09-23')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('23/09/2026')).toBe(false);
  });

  it('suma y resta días cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-09-01', '2026-09-23')).toBe(22);
  });

  it('usa semanas de lunes a domingo', () => {
    expect(isoWeekday('2026-09-23')).toBe(3); // miércoles
    expect(isoWeekday('2026-09-20')).toBe(7); // domingo
    expect(periodRange('week', '2026-09-23')).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(periodRange('week', '2026-09-20')).toEqual({ from: '2026-09-14', to: '2026-09-20' });
  });

  it('calcula meses y periodos anteriores', () => {
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange('month', periodRange('month', '2026-03-15'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange('day', periodRange('day', '2026-09-01'))).toEqual({ from: '2026-08-31', to: '2026-08-31' });
    expect(daysIn({ from: '2026-09-21', to: '2026-09-27' })).toHaveLength(7);
  });

  it('calcula hoy en la zona de la persona', () => {
    const now = new Date('2026-09-24T03:00:00Z');
    expect(todayIn('America/Mexico_City', now)).toBe('2026-09-23');
    expect(todayIn('Europe/Madrid', now)).toBe('2026-09-24');
    expect(todayIn('No/Existe', now)).toBe('2026-09-24');
  });
});

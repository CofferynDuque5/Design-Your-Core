import { describe, expect, it } from 'vitest';
import { daysLabel, greeting, longDay, rangeLabel, shortDay } from './format';

describe('formato de fechas', () => {
  it('escribe el día completo en español', () => {
    expect(longDay('2026-09-23')).toBe('Miércoles 23 de septiembre');
    expect(shortDay('2026-09-23')).toMatch(/^23 sept?$/);
  });

  it('nombra el rango: día, mes completo o intervalo', () => {
    expect(rangeLabel('2026-09-23', '2026-09-23')).toBe('Miércoles 23 de septiembre');
    expect(rangeLabel('2026-09-01', '2026-09-30')).toBe('Septiembre de 2026');
    expect(rangeLabel('2026-09-21', '2026-09-27')).toMatch(/^21 sept?\. – 27 sept?$|^21 sept? – 27 sept?$/);
  });

  it('resume los días de un hábito', () => {
    expect(daysLabel('1234567')).toBe('Todos los días');
    expect(daysLabel('12345')).toBe('Entre semana');
    expect(daysLabel('67')).toBe('Fines de semana');
    expect(daysLabel('135')).toBe('L · X · V');
  });

  it('saluda según la hora', () => {
    expect(greeting(new Date(2026, 8, 23, 8))).toBe('Buenos días');
    expect(greeting(new Date(2026, 8, 23, 15))).toBe('Buenas tardes');
    expect(greeting(new Date(2026, 8, 23, 22))).toBe('Buenas noches');
  });
});

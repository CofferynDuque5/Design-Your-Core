import { describe, expect, it } from 'vitest';
import { focusStats, legacyItemSchemas, legacyPatchSchemas, nextFocusMode, reorderById, type LegacyFocus } from '../src/legacy.js';

describe('módulos de la app anterior', () => {
  it('completa los valores por defecto de la app anterior y rechaza campos extra', () => {
    expect(legacyItemSchemas.blocks.parse({ id: 'b1', label: 'Leer', start: 8.5, dur: 1 })).toEqual({ id: 'b1', label: 'Leer', sub: '', start: 8.5, dur: 1, kind: 'study' });
    expect(legacyItemSchemas.tasks.parse({ id: 't1', title: 'Llamar', time: '10:00' })).toEqual({ id: 't1', title: 'Llamar', pri: 'media', time: '10:00', rem: true, done: false, tags: '' });
    expect(legacyItemSchemas.reminders.parse({ id: 'r1', day: 14, title: 'Dentista' })).toMatchObject({ when: '', color: '#0FA968', icon: 'doc', on: true });
    expect(legacyItemSchemas.todos.safeParse({ id: 'a', title: 'x', extra: 1 }).success).toBe(false);
  });

  it('valida los formatos antiguos', () => {
    expect(legacyItemSchemas.reminders.safeParse({ id: 'r', day: 32, title: 'x' }).success).toBe(false);
    expect(legacyItemSchemas.reminders.safeParse({ id: 'r', day: 3, title: 'x', color: '#123456' }).success).toBe(false);
    expect(legacyItemSchemas.blocks.safeParse({ id: 'b', label: 'x', start: 23, dur: 2 }).success).toBe(false);
    expect(legacyItemSchemas.blocks.safeParse({ id: 'b', label: 'x', start: 8, dur: 1, kind: 'otro' }).success).toBe(false);
    expect(legacyItemSchemas.classes.safeParse({ id: 'c', day: 1, start: '10:00', end: '09:00', title: 'x' }).success).toBe(false);
    expect(legacyItemSchemas.classes.safeParse({ id: 'c', day: 8, start: '08:00', end: '09:00', title: 'x' }).success).toBe(false);
    expect(legacyItemSchemas.focus.safeParse({ id: 'f', mode: 'focus', seconds: 0, dateKey: '2026-09-25' }).success).toBe(false);
    expect(legacyItemSchemas.focus.safeParse({ id: 'f', mode: 'focus', seconds: 60, dateKey: '2026-02-30' }).success).toBe(false);
    expect(legacyItemSchemas.todos.safeParse({ id: 'mal id!', title: 'x' }).success).toBe(false);
  });

  it('un cambio parcial no trae valores por defecto ni deja cambiar el id', () => {
    expect(legacyPatchSchemas.tasks.parse({ done: true })).toEqual({ done: true });
    expect(legacyPatchSchemas.tasks.safeParse({ id: 'otro' }).success).toBe(false);
    expect(legacyPatchSchemas.reminders.safeParse({ day: 0 }).success).toBe(false);
  });

  it('reordena como la app anterior', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(reorderById(list, ['c', 'a', 'zz']).map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('alterna enfoque y descansos: largo tras cada cuarta sesión', () => {
    expect([1, 2, 3, 4, 5, 8].map((n) => nextFocusMode('focus', n))).toEqual(['short', 'short', 'short', 'long', 'short', 'long']);
    expect(nextFocusMode('short', 1)).toBe('focus');
    expect(nextFocusMode('long', 4)).toBe('focus');
  });

  it('calcula las estadísticas de enfoque', () => {
    const f = (dateKey: string, seconds = 1500, mode: LegacyFocus['mode'] = 'focus'): LegacyFocus => ({ id: `${dateKey}-${seconds}`, mode, seconds, dateKey });
    const records = [f('2026-09-25'), f('2026-09-25', 900), f('2026-09-25', 300, 'short'), f('2026-09-24'), f('2026-09-23'), f('2026-09-10', 3600)];
    expect(focusStats(records, '2026-09-25')).toEqual({ sessionsToday: 2, hoursWeek: (1500 * 3 + 900) / 3600, hoursTotal: (1500 * 3 + 900 + 3600) / 3600, streak: 3 });
    expect(focusStats(records, '2026-09-26').streak).toBe(3);
    expect(focusStats(records, '2026-09-27').streak).toBe(0);
  });
});

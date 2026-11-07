import { describe, expect, it } from 'vitest';
import { expandNotificationPlan, type PlannedNotification } from '../src/notify';

const p = (id: string, trigger: PlannedNotification['trigger']): PlannedNotification => ({ id, title: id, body: '', url: '/', trigger });

describe('expandNotificationPlan', () => {
  // Viernes 25 de septiembre de 2026, 10:00 hora local.
  const now = new Date(2026, 8, 25, 10, 0);
  it('pone las clases semanales en sus días', () => {
    const a = expandNotificationPlan([p('lunes', { kind: 'weekly', weekday: 1, hour: 7, minute: 50 })], now, 14);
    expect(a.map((x) => new Date(x.at).getDate())).toEqual([28, 5]);
    expect(new Date(a[0].at).getHours()).toBe(7);
  });
  it('un recordatorio del 31 suena el 30 de septiembre', () => {
    const a = expandNotificationPlan([p('fin', { kind: 'monthly', day: 31, hour: 9, minute: 0 })], now, 14);
    expect(a).toHaveLength(1);
    expect(new Date(a[0].at).getDate()).toBe(30);
  });
  it('no programa lo que ya pasó', () => {
    expect(expandNotificationPlan([p('hoy', { kind: 'weekly', weekday: 5, hour: 9, minute: 0 })], now, 6)).toEqual([]);
    expect(expandNotificationPlan([p('tarea', { kind: 'date', at: new Date(2026, 8, 25, 18).toISOString() })], now)).toHaveLength(1);
  });
});

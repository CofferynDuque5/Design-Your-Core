import { describe, expect, it } from 'vitest';
import { applyLegacyOp, newLegacyId, type LegacyData } from '../src/legacy.js';
import {
  calendarCycleDays,
  calendarMarks,
  classWhenLabel,
  describeCalendarDay,
  drawableBlocks,
  durationLabel,
  focusClock,
  focusSpoken,
  layoutLanes,
  nextClass,
  normalizeHHMM,
  shiftMonth,
  TOOL_CATALOG,
  TOOL_GROUPS,
  toolStatus,
  validClass,
} from '../src/tools.js';

// Catálogo de «Más» y utilidades de las herramientas que comparten la web y el móvil.
describe('herramientas compartidas', () => {
  it('el catálogo tiene todas las secciones, cada una en un grupo, con rutas únicas', () => {
    expect(TOOL_CATALOG).toHaveLength(24);
    expect(new Set(TOOL_CATALOG.map((t) => t.path)).size).toBe(24);
    for (const t of TOOL_CATALOG) expect(TOOL_GROUPS.map((g) => g.id)).toContain(t.group);
  });

  it('cuenta los elementos con su unidad, «Vacío» o la nota', () => {
    const data: LegacyData = { todos: [{ id: 'a', title: 'x', done: false }, { id: 'b', title: 'y', done: true }], reminders: [] };
    const tool = (id: string) => TOOL_CATALOG.find((t) => t.id === id)!;
    expect(toolStatus(tool('pendientes'), data)).toBe('1 por hacer');
    expect(toolStatus(tool('calendario'), data)).toBe('Vacío');
    expect(toolStatus(tool('asistente'), data)).toBe('Con tu clave');
    expect(toolStatus(tool('agenda'), undefined)).toBe('Vacío');
  });

  it('aplica los cambios optimistas como el servidor', () => {
    const data: LegacyData = { todos: [{ id: 't1', title: 'A', done: false }, { id: 't2', title: 'B', done: false }], subtasks: [{ id: 's1', todoId: 't1', title: 'paso', done: false }] };
    expect(applyLegacyOp(data, 'todos', { type: 'update', id: 't1', patch: { done: true } }).todos?.[0].done).toBe(true);
    const removed = applyLegacyOp(data, 'todos', { type: 'remove', id: 't1' });
    expect(removed.todos?.map((t) => t.id)).toEqual(['t2']);
    expect(removed.subtasks).toEqual([]);
    expect(applyLegacyOp(data, 'todos', { type: 'reorder', ids: ['t2'] }).todos?.map((t) => t.id)).toEqual(['t2', 't1']);
    // Enfoque: lo más reciente primero.
    const focus = applyLegacyOp({ focus: [{ id: 'f1', mode: 'focus', seconds: 60, dateKey: '2026-09-25' }] }, 'focus', { type: 'add', item: { id: 'f2', mode: 'short', seconds: 30, dateKey: '2026-09-26' } });
    expect(focus.focus?.map((f) => f.id)).toEqual(['f2', 'f1']);
    // Tareas: `rem` sigue a `time`.
    const tasks = applyLegacyOp({ tasks: [{ id: 'k', title: 'x', pri: 'media', time: null, rem: false, done: false, tags: '' }] }, 'tasks', { type: 'update', id: 'k', patch: { time: '10:00' } });
    expect(tasks.tasks?.[0].rem).toBe(true);
  });

  it('crea ids válidos para el documento', () => {
    expect(newLegacyId()).toMatch(/^[\w-]{1,100}$/);
    expect(newLegacyId()).not.toBe(newLegacyId());
  });

  it('horas, duraciones y bloques', () => {
    expect(durationLabel(1.5)).toBe('1 h 30 min');
    expect(durationLabel(0.5)).toBe('30 min');
    expect(drawableBlocks([{ start: 8, dur: 1 }, { start: 'x', dur: 1 }, { start: 9, dur: 0 }] as Array<{ start: unknown; dur: unknown }>)).toHaveLength(1);
    const lanes = layoutLanes([
      { item: 'a', start: 8, end: 10 },
      { item: 'b', start: 9, end: 11 },
      { item: 'c', start: 12, end: 13 },
    ]);
    expect(lanes.map((l) => [l.item, l.lane, l.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ]);
  });

  it('horario: próxima clase y horas escritas a mano', () => {
    const classes = [
      { id: 'c1', day: 1, start: '08:00', end: '09:30', title: 'Cálculo', room: 'A-201', color: '#4F7CFF', subject: '' },
      { id: 'c2', day: 3, start: '10:00', end: '11:00', title: 'Física', room: '', color: '#0FA968', subject: '' },
    ];
    // Lunes 28 de septiembre de 2026 a las 8:15 (hora local).
    const monday = new Date(2026, 8, 28, 8, 15);
    const now = nextClass(classes, monday)!;
    expect(now.c.id).toBe('c1');
    expect(classWhenLabel(now.c, now.wait, now.ongoing, monday)).toBe('Ahora, hasta las 09:30');
    const later = new Date(2026, 8, 28, 10, 0);
    const next = nextClass(classes, later)!;
    expect(classWhenLabel(next.c, next.wait, next.ongoing, later)).toBe('Miércoles a las 10:00');
    expect(validClass({ ...classes[0], end: '07:00' })).toBe(false);
    expect(normalizeHHMM('8:30')).toBe('08:30');
    expect(normalizeHHMM('0830')).toBe('08:30');
    expect(normalizeHHMM('hola')).toBe('hola');
  });

  it('enfoque: reloj y texto para lectores', () => {
    expect(focusClock(25 * 60_000)).toBe('25:00');
    expect(focusClock(61_200)).toBe('01:02');
    expect(focusSpoken(61_000)).toBe('1 minuto y 1 segundo');
    expect(focusSpoken(0)).toBe('0 segundos');
  });

  it('calendario: eventos de cada mes y marcas de otras secciones', () => {
    const data = {
      reminders: [
        { id: 'r1', day: 31, title: 'Pagar', when: '', color: '#0FA968', icon: 'doc', on: true },
        { id: 'r2', day: 5, title: 'Dentista', when: '14:00', color: '#4F7CFF', icon: 'doc', on: true },
        { id: 'r3', day: 5, title: 'Apagado', when: '', color: '#4F7CFF', icon: 'doc', on: false },
      ],
      workouts: [{ id: 'w', date: '2026-09-05', plan: 'Fuerza', minutes: 40 }],
      goals: [{ id: 'g', deadline: '2026-09-20', title: 'Leer' }],
      journal: [{ id: 'j', date: '2026-10-01' }],
    } as unknown as LegacyData;
    const marks = calendarMarks(data, '2026-09-01', calendarCycleDays(data, '2026-09-01', '2026-09-26', false));
    // Septiembre tiene 30 días: el evento del 31 no aparece.
    expect(marks.get('2026-09-30')).toBeUndefined();
    expect([...(marks.get('2026-09-05') ?? [])]).toEqual(['event', 'workout']);
    expect([...(marks.get('2026-09-20') ?? [])]).toEqual(['goal']);
    expect(describeCalendarDay('2026-09-05', marks, data.reminders ?? [])).toBe(': 1 evento, entreno');
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
  });
});

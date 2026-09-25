import { describe, expect, it } from 'vitest';
import {
  checkItems,
  checkItemsPayload,
  dueThisWeek,
  focusStats,
  legacyItemSchemas,
  legacyPatchSchemas,
  mergeLegacyItem,
  nextFocusMode,
  parseDeadline,
  projectProgress,
  reorderById,
  splitTags,
  stepStates,
  type LegacyFocus,
} from '../src/legacy.js';

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

  it('tanda 2: valores por defecto de la app anterior', () => {
    expect(legacyItemSchemas.subjects.parse({ id: 's1', name: 'Física' })).toEqual({ id: 's1', name: 'Física', teacher: '', room: '', color: '#4F7CFF', nextClass: '', topics: [] });
    expect(legacyItemSchemas.projects.parse({ id: 'p1', title: 'Ensayo' })).toEqual({ id: 'p1', title: 'Ensayo', subject: '', deadline: '', status: 'curso', color: '#0FA968', milestones: [] });
    expect(legacyItemSchemas.roadmaps.parse({ id: 'r1', name: 'Ingeniería' })).toEqual({ id: 'r1', name: 'Ingeniería', color: '#8B5CF6', steps: [] });
    expect(legacyItemSchemas.notebooks.parse({ id: 'n1', category: '  ' })).toEqual({ id: 'n1', title: 'Cuaderno', category: 'General', subject: '', topic: '', color: '#4F7CFF', emoji: '📓' });
    expect(legacyItemSchemas.noteBoxes.parse({ id: 'b1', notebookId: 'n1' })).toEqual({ id: 'b1', notebookId: 'n1', title: '', text: '', color: '#FFF7D6', kind: 'text', lang: '' });
    expect(legacyItemSchemas.noteBoxes.parse({ id: 'b2', notebookId: 'n1', kind: 'code' })).toMatchObject({ color: '#1e1e2e', kind: 'code', lang: 'js' });
    expect(legacyItemSchemas.content.parse({ id: 'c1', title: 'Video' })).toEqual({ id: 'c1', title: 'Video', stage: 'idea', platform: 'youtube', notes: '', script: '', due: '' });
    expect(legacyItemSchemas.ideas.parse({ id: 'i1', title: 'App' })).toEqual({ id: 'i1', title: 'App', body: '', category: 'app', tags: '' });
    expect(legacyItemSchemas.projects.parse({ id: 'p2', title: 'x', milestones: [{ id: 'xk3j9a2b', name: 'Borrador' }] }).milestones).toEqual([{ id: 'xk3j9a2b', name: 'Borrador', done: false, date: '' }]);
  });

  it('tanda 2: rechaza estados, plataformas, categorías y subelementos inválidos', () => {
    expect(legacyItemSchemas.projects.safeParse({ id: 'p', title: 'x', status: 'hecho' }).success).toBe(false);
    expect(legacyItemSchemas.content.safeParse({ id: 'c', title: 'x', platform: 'twitch' }).success).toBe(false);
    expect(legacyItemSchemas.ideas.safeParse({ id: 'i', title: 'x', category: 'ventas' }).success).toBe(false);
    expect(legacyPatchSchemas.subjects.safeParse({ topics: [{ id: 't', name: 'x', extra: 1 }] }).success).toBe(false);
    expect(legacyPatchSchemas.roadmaps.safeParse({ steps: [{ name: 'sin id' }] }).success).toBe(false);
    expect(legacyPatchSchemas.noteBoxes.parse({ lang: 'python' })).toEqual({ lang: 'python' });
  });

  it('fusiona temas, hitos y pasos por id conservando lo que no conoce', () => {
    const subject = { id: 's', name: 'Física', topics: [{ id: 'a', name: 'Ondas', done: false, nota: 'vieja' }, { id: 'b', name: 'Óptica', done: false }], extra: 1 };
    const merged = mergeLegacyItem('subjects', subject, { topics: [{ id: 'a', name: 'Ondas', done: true }, { id: 'c', name: 'Calor', done: false }] });
    expect(merged).toEqual({ id: 's', name: 'Física', extra: 1, topics: [{ id: 'a', name: 'Ondas', done: true, nota: 'vieja' }, { id: 'c', name: 'Calor', done: false }] });
    expect(mergeLegacyItem('ideas', { id: 'i', title: 'x', raro: true }, { title: 'y' })).toEqual({ id: 'i', title: 'y', raro: true });
  });

  it('normaliza subelementos antiguos y envía solo los campos conocidos', () => {
    const list = checkItems([{ id: 'a', name: 'Uno', done: 1, extra: true }, null, { name: 'Sin id' }], () => 'nuevo');
    expect(list).toEqual([{ id: 'a', name: 'Uno', done: true, extra: true }, { id: 'nuevo', name: 'Sin id', done: false }]);
    expect(checkItemsPayload(list)).toEqual([{ id: 'a', name: 'Uno', done: true }, { id: 'nuevo', name: 'Sin id', done: false }]);
    expect(checkItemsPayload([{ id: 'm', name: 'Hito', done: false, date: '' }])).toEqual([{ id: 'm', name: 'Hito', done: false, date: '' }]);
  });

  it('progreso de proyectos y entregas de la semana como la app anterior', () => {
    expect(projectProgress({ status: 'curso', milestones: [] })).toBe(0);
    expect(projectProgress({ status: 'revision', milestones: [] })).toBe(90);
    expect(projectProgress({ status: 'entregado' })).toBe(100);
    expect(projectProgress({ status: 'entregado', milestones: [{ done: true }, { done: false }, { done: false }] })).toBe(33);
    const now = Date.parse('2026-09-25T12:00:00Z');
    expect(dueThisWeek('la próxima clase', now)).toBe(true); // no se entiende: cuenta, como antes
    expect(dueThisWeek('', now)).toBe(false);
    expect(dueThisWeek('28 SEP', now)).toBe(true);
    expect(dueThisWeek('25 sep.', now)).toBe(true);
    expect(dueThisWeek('20 SEP', now)).toBe(false);
    expect(dueThisWeek('3 de octubre', now)).toBe(false);
    expect(dueThisWeek('2026-09-28', now)).toBe(true);
    expect(dueThisWeek('2026-10-20', now)).toBe(false);
    expect(parseDeadline('20 SEP', new Date(now))?.getMonth()).toBe(8);
    expect(parseDeadline('5 dic 2027')?.getFullYear()).toBe(2027);
    expect(parseDeadline('31 foo')).toBeNull();
  });

  it('estados de los pasos de un roadmap y etiquetas', () => {
    expect(stepStates([{ done: true }, { done: false }, { done: false }, { done: false }])).toEqual(['done', 'current', 'next', 'locked']);
    expect(stepStates([{ done: true }, { done: true }])).toEqual(['done', 'done']);
    expect(stepStates([{ done: false }, { done: true }])).toEqual(['current', 'done']);
    expect(splitTags('examen, física , ,saas')).toEqual(['examen', 'física', 'saas']);
    expect(splitTags(undefined)).toEqual([]);
  });
});

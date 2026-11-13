import { describe, expect, it } from 'vitest';
import { addUnitPatch, checkItemsPayload, projectCategoryOf, projectMailLink, projectTodos, courseProgress, courseUnits, removeUnitPatch, renameUnitPatch, courseResume, legacyItemSchemas, lessonsByUnit, lessonsFromPlaylist, lessonsPatch, nextLesson, type LegacyCourse } from '../src/index.js';

const base: LegacyCourse = { id: 'c1', topic: 'React', title: 'React', url: '', status: 'pendiente', notes: '' };
const lessons = [
  { id: 'l1', title: 'Instalación', unit: 'Unidad 1', done: true },
  { id: 'l2', title: 'JSX', unit: 'Unidad 1' },
  { id: 'l3', title: 'useState', unit: 'Unidad 2' },
  { id: 'l4', title: 'Repaso' },
];

describe('Lecciones de un curso', () => {
  it('el avance y el texto salen de las lecciones vistas', () => {
    const c = { ...base, status: 'curso' as const, lessons };
    expect(courseProgress(c)).toBe(25);
    expect(nextLesson(c)?.title).toBe('JSX');
    expect(courseResume(c)).toBe('1 de 4 lecciones · sigue «JSX»');
  });

  it('agrupa por unidad en el orden en que aparecen', () => {
    expect(lessonsByUnit(lessons).map((g) => [g.unit, g.items.map((l) => l.id)])).toEqual([
      ['Unidad 1', ['l1', 'l2']],
      ['Unidad 2', ['l3']],
      ['', ['l4']],
    ]);
  });

  it('marcar lecciones cambia el estado: alguna → Viendo, todas → Terminado', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    expect(lessonsPatch(base, lessons, now)).toMatchObject({ progress: 25, status: 'curso', lastAt: now.toISOString() });
    const all = lessons.map((l) => ({ ...l, done: true }));
    expect(lessonsPatch({ ...base, lessons }, all, now)).toMatchObject({ progress: 100, status: 'hecho' });
    expect(lessonsPatch({ ...base, status: 'hecho', lessons: all }, lessons.map((l) => ({ ...l, done: false })), now)).toMatchObject({ progress: 0, status: 'curso' });
    // Sin cambios en lo visto no se toca «lastAt».
    expect(lessonsPatch({ ...base, lessons }, [...lessons, { id: 'l5', title: 'Nueva' }], now)).not.toHaveProperty('lastAt');
  });

  it('las lecciones se validan y son opcionales', () => {
    expect(legacyItemSchemas.courses.parse(base)).not.toHaveProperty('lessons');
    expect(legacyItemSchemas.courses.parse({ ...base, lessons })).toMatchObject({ lessons });
    expect(legacyItemSchemas.courses.safeParse({ ...base, lessons: [{ id: 'x', title: '' }] }).success).toBe(false);
    expect(legacyItemSchemas.courses.safeParse({ ...base, lessons: [{ id: 'x', title: 'a', url: 'javascript:alert(1)' }] }).success).toBe(false);
  });

  it('una lista de YouTube se vuelve lecciones', () => {
    let n = 0;
    expect(lessonsFromPlaylist([{ video: 'aaaaaaaaaaa', title: 'Clase 1', seconds: 600.4 }, { video: 'bbbbbbbbbbb', title: '', seconds: 0 }], 'PLabc', () => `id${++n}`)).toEqual([
      { id: 'id1', title: 'Clase 1', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PLabc', seconds: 600 },
      { id: 'id2', title: 'Video 2', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb&list=PLabc' },
    ]);
  });
});

import { reminderFallsOn } from '../src/index.js';
describe('Eventos del 29, 30 y 31', () => {
  it('salen el último día de los meses más cortos', () => {
    expect(reminderFallsOn({ day: 31 }, '2026-11-30')).toBe(true);
    expect(reminderFallsOn({ day: 31 }, '2026-12-31')).toBe(true);
    expect(reminderFallsOn({ day: 31 }, '2026-12-30')).toBe(false);
    expect(reminderFallsOn({ day: 30 }, '2027-02-28')).toBe(true);
    expect(reminderFallsOn({ day: 15 }, '2027-02-15')).toBe(true);
  });
});

describe('unidades del curso', () => {
  const base: LegacyCourse = { id: 'c1', topic: 'React', title: 'Curso', url: '', status: 'pendiente', notes: '', units: ['Unidad 2'], lessons: [{ id: 'a', title: 'Intro', unit: 'Unidad 1', done: true }, { id: 'b', title: 'JSX', unit: 'Unidad 1' }] };

  it('muestra las unidades vacías y las de las lecciones', () => {
    expect(courseUnits(base)).toEqual(['Unidad 2', 'Unidad 1']);
    expect(lessonsByUnit(base.lessons!, base.units).map((g) => [g.unit, g.items.length])).toEqual([
      ['Unidad 2', 0],
      ['Unidad 1', 2],
    ]);
  });

  it('añade, renombra y quita unidades', () => {
    expect(addUnitPatch(base, ' Unidad 3 ')).toEqual({ units: ['Unidad 2', 'Unidad 1', 'Unidad 3'] });
    expect(addUnitPatch(base, 'unidad 1')).toBeNull();
    const r = renameUnitPatch(base, 'Unidad 1', 'Módulo A')!;
    expect(r.units).toEqual(['Unidad 2', 'Módulo A']);
    expect(r.lessons!.map((l) => l.unit)).toEqual(['Módulo A', 'Módulo A']);
    expect(renameUnitPatch(base, 'Unidad 1', 'Unidad 2')).toBeNull();
    const d = removeUnitPatch(base, 'Unidad 1');
    expect(d.units).toEqual(['Unidad 2']);
    expect(d.lessons).toEqual([]);
    expect(legacyItemSchemas.courses.safeParse({ ...base, units: ['Unidad 1', ''] }).success).toBe(false);
    expect(legacyItemSchemas.courses.safeParse(base).success).toBe(true);
  });
});

describe('proyectos: categoría, correo y lista por terminar', () => {
  it('lee la categoría y arma el enlace del correo', () => {
    expect(projectCategoryOf({ category: 'web' })).toBe('web');
    expect(projectCategoryOf({ category: 'nave' })).toBeNull();
    expect(projectMailLink({ email: 'hola@MiSitio.com' })).toBe('https://misitio.com/webmail');
    expect(projectMailLink({ email: 'hola@misitio.com', mailUrl: 'https://webmail.otro.com' })).toBe('https://webmail.otro.com');
    expect(projectMailLink({ email: 'nada' })).toBeNull();
  });

  it('valida y conserva el tipo de cada pendiente', () => {
    const p = { id: 'p1', title: 'Sitio', subject: '', deadline: '', status: 'curso', priority: 'media', color: '#0FA968', milestones: [], category: 'web', email: 'hola@misitio.com', todos: [{ id: 't1', name: 'Formulario', done: false, kind: 'mejora' }] };
    expect(legacyItemSchemas.projects.safeParse(p).success).toBe(true);
    expect(legacyItemSchemas.projects.safeParse({ ...p, email: 'no' }).success).toBe(false);
    expect(legacyItemSchemas.projects.safeParse({ ...p, category: 'nave' }).success).toBe(false);
    expect(projectTodos({ todos: [{ id: 't1', name: 'A', kind: 'raro' }] }, () => 'x')[0].kind).toBe('falta');
    expect(checkItemsPayload(projectTodos(p, () => 'x'))).toEqual([{ id: 't1', name: 'Formulario', done: false, kind: 'mejora' }]);
  });
});

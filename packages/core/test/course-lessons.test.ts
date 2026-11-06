import { describe, expect, it } from 'vitest';
import { courseProgress, courseResume, legacyItemSchemas, lessonsByUnit, lessonsFromPlaylist, lessonsPatch, nextLesson, type LegacyCourse } from '../src/index.js';

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

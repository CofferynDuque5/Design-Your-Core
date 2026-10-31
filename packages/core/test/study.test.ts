import { describe, expect, it } from 'vitest';
import { courseLengthSource, formatLength, hoursFromText, parseCourseLength, parseIsoDuration, planStudy, type LegacyData } from '../src/index.js';

describe('duración de un curso desde su enlace', () => {
  it('sabe qué leer en cada plataforma', () => {
    expect(courseLengthSource('https://youtu.be/abcdefghijk')).toEqual({ kind: 'youtube-video', fetch: 'https://www.youtube.com/watch?v=abcdefghijk&hl=es' });
    expect(courseLengthSource('https://www.youtube.com/watch?v=abcdefghijk&list=PLxxxxxxxxxxxx')?.kind).toBe('youtube-list');
    expect(courseLengthSource('https://www.coursera.org/learn/machine-learning?x=1')).toEqual({ kind: 'coursera', fetch: 'https://api.coursera.org/api/courses.v1?q=slug&slug=machine-learning&fields=workload' });
    expect(courseLengthSource('https://www.udemy.com/course/ingles-desde-cero/')?.kind).toBe('udemy');
    expect(courseLengthSource('https://platzi.com/cursos/javascript/')).toEqual({ kind: 'page', fetch: 'https://platzi.com/cursos/javascript/' });
    expect(courseLengthSource('javascript:alert(1)')).toBeNull();
  });

  it('lee textos de horas en español e inglés', () => {
    expect(hoursFromText('Approximately 61 hours to complete')).toBe(61);
    expect(hoursFromText('62,5 horas en total')).toBe(62.5);
    expect(hoursFromText('4-6 hours/week, 3 weeks')).toBe(15);
    expect(hoursFromText('2 h 30 min')).toBe(2.5);
    expect(hoursFromText('45 minutos')).toBe(0.75);
    expect(hoursFromText('sin datos')).toBeNull();
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('PT')).toBeNull();
    expect(formatLength(5400)).toBe('1 h 30 min');
    expect(formatLength(2700)).toBe('45 min');
  });

  it('YouTube: un video y una lista (completa o con más de 100 videos)', () => {
    expect(parseCourseLength('youtube-video', 'x"lengthSeconds":"212",y')).toEqual({ seconds: 212, exact: true });
    const item = (id: string, s: number) => `"playlistVideoRenderer":{"videoId":"${id}","title":{},"lengthSeconds":"${s}"}`;
    const page = [item('aaaaaaaaaaa', 600), item('bbbbbbbbbbb', 1200), item('aaaaaaaaaaa', 600)].join(',');
    expect(parseCourseLength('youtube-list', page)).toEqual({ seconds: 1800, exact: true, videos: 2 });
    expect(parseCourseLength('youtube-list', `"numVideosText":{"runs":[{"text":"10"}]},${page}`)).toEqual({ seconds: 9000, exact: false, videos: 10 });
  });

  it('Coursera, Udemy y cualquier página', () => {
    expect(parseCourseLength('coursera', JSON.stringify({ elements: [{ workload: 'Approximately 20 hours to complete' }] }))).toEqual({ seconds: 72000, exact: false });
    expect(parseCourseLength('udemy', JSON.stringify({ estimated_content_length: 750, content_info: '12.5 total hours' }))).toEqual({ seconds: 45000, exact: true });
    expect(parseCourseLength('udemy', JSON.stringify({ content_info: '12.5 total hours' }))).toEqual({ seconds: 45000, exact: false });
    expect(parseCourseLength('page', '<script type="application/ld+json">{"timeRequired":"PT8H"}</script>')).toEqual({ seconds: 28800, exact: false });
    expect(parseCourseLength('page', '<p>Este curso tiene <b>6 horas de contenido</b></p>')).toEqual({ seconds: 21600, exact: false });
    expect(parseCourseLength('page', '<p>Hola</p>')).toBeNull();
  });
});

describe('horario automático', () => {
  const data = {
    courses: [
      { id: 'a', topic: 'Inglés', title: 'Inglés', url: '', status: 'curso', notes: '', length: 36000, progress: 50 },
      { id: 'b', topic: 'React', title: 'React', url: '', status: 'pendiente', notes: '', length: 6 * 3600 },
      { id: 'c', topic: 'Guitarra', title: 'Guitarra', url: '', status: 'pendiente', notes: '' },
      { id: 'h', topic: 'X', title: 'Hecho', url: '', status: 'hecho', notes: '' },
    ],
    classes: [
      { id: 'k1', day: 1, start: '18:00', end: '19:00', title: 'Gimnasio', room: '', color: '#000000', subject: '' },
      { id: 'k2', day: 3, start: '18:00', end: '19:00', title: 'Inglés viejo', room: '', color: '#000000', subject: '', course: 'a' },
    ],
  } as unknown as LegacyData;
  const now = new Date('2026-11-02T12:00:00Z');

  it('reparte en los huecos libres, un día a la vez, y calcula cuándo terminas', () => {
    const plan = planStudy(data, ['a', 'b', 'c', 'h'], { days: '135', from: '18:00', to: '20:00', session: 60, weekly: 5 }, now);
    // Lunes 18-19 está ocupado; la clase vieja del curso «a» se reemplaza.
    expect(plan.sessions.map((s) => `${s.day} ${s.start}`)).toEqual(['1 19:00', '3 18:00', '3 19:00', '5 18:00', '5 19:00']);
    expect(plan.fits).toBe(5);
    const per = Object.fromEntries(plan.courses.map((c) => [c.courseId, c]));
    expect(per.h).toBeUndefined();
    expect(per.a.perWeek + per.b.perWeek + per.c.perWeek).toBe(5);
    expect(per.b.perWeek).toBeGreaterThanOrEqual(1);
    expect(per.c).toMatchObject({ weeks: null, finish: null });
    // «a»: faltan 5 h; «b»: 6 h.
    expect(per.a.weeks).toBe(Math.ceil(5 / per.a.perWeek));
    expect(per.b.finish).toBe(new Date(now.getTime() + per.b.weeks! * 7 * 864e5).toISOString().slice(0, 10));
    // No hay dos sesiones seguidas del mismo curso el mismo día si se puede evitar.
    expect(new Set(plan.sessions.map((s) => s.courseId))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('si no cabe lo pedido, usa lo que hay', () => {
    const plan = planStudy(data, ['b'], { days: '1', from: '18:00', to: '20:00', session: 60, weekly: 10 }, now);
    expect(plan.sessions).toEqual([{ courseId: 'b', day: 1, start: '19:00', end: '20:00' }]);
    expect(plan.fits).toBe(1);
    expect(planStudy(data, ['b'], { days: '', from: '18:00', to: '20:00', session: 60, weekly: 3 }).sessions).toEqual([]);
  });
});

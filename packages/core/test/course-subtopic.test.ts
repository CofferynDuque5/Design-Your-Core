import { describe, expect, it } from 'vitest';
import { courseOrigin, coursesBySubtopic, legacyItemSchemas, parseCourseLength, planTopics, type LegacyData } from '../src/index.js';

describe('Cursos: subcategoría, canal y horario por tema', () => {
  it('agrupa por subcategoría: primero los que no tienen', () => {
    const groups = coursesBySubtopic([
      { id: '1', subtopic: 'Hooks' },
      { id: '2' },
      { id: '3', subtopic: 'hooks ' },
      { id: '4', subtopic: 'Redux' },
    ]);
    expect(groups.map((g) => [g.subtopic, g.items.map((c) => c.id)])).toEqual([
      ['', ['2']],
      ['Hooks', ['1', '3']],
      ['Redux', ['4']],
    ]);
  });

  it('el canal o academia escrito gana a la plataforma del enlace', () => {
    expect(courseOrigin({ source: 'midudev', url: 'https://youtu.be/abcdefghijk' })).toBe('midudev');
    expect(courseOrigin({ source: '  ', url: 'https://youtu.be/abcdefghijk' })).toBe('YouTube');
    expect(courseOrigin({ url: '' })).toBe('');
  });

  it('los campos nuevos son opcionales y se validan', () => {
    const base = { id: 'c1', topic: 'React', title: '', url: '', notes: '' };
    expect(legacyItemSchemas.courses.parse(base)).not.toHaveProperty('subtopic');
    expect(legacyItemSchemas.courses.parse({ ...base, subtopic: ' Hooks ', source: 'midudev' })).toMatchObject({ subtopic: 'Hooks', source: 'midudev' });
    expect(legacyItemSchemas.courses.safeParse({ ...base, source: 'x'.repeat(121) }).success).toBe(false);
  });

  it('lee el canal y el nombre de la página de YouTube', () => {
    const video = '<meta property="og:title" content="React desde cero &amp; más">"videoDetails":{"videoId":"abcdefghijk","lengthSeconds":"3600","author":"midudev"},"ownerChannelName":"midudev"';
    expect(parseCourseLength('youtube-video', video)).toEqual({ seconds: 3600, exact: true, author: 'midudev', title: 'React desde cero & más' });
    const list = '<meta property="og:title" content="Curso de Inglés">"ownerText":{"runs":[{"text":"Ingl\\u00e9s con Ana"}]},"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","lengthSeconds":"600"}';
    expect(parseCourseLength('youtube-list', list)).toEqual({ seconds: 600, exact: true, videos: 1, author: 'Inglés con Ana', title: 'Curso de Inglés' });
  });

  it('«Crear horario» da al menos una sesión a cada tema aunque pidan pocas horas', () => {
    const topics = ['React', 'Inglés', 'Finanzas', 'Guitarra'];
    const data = { courses: topics.map((t, i) => ({ id: `c${i}`, topic: t, title: t, url: '', status: 'pendiente', notes: '' })), classes: [] } as unknown as LegacyData;
    const plan = planTopics(data, topics, { days: '12345', from: '18:00', to: '21:00', session: 60, weekly: 2 });
    expect(new Set(plan.sessions.map((s) => s.courseId))).toEqual(new Set(['c0', 'c1', 'c2', 'c3']));
    expect(plan.topics.every((t) => t.perWeek >= 1)).toBe(true);
  });
});

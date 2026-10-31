import { describe, expect, it } from 'vitest';
import { legacyItemSchemas, legacyPatchSchemas, type LegacyCourse, type LegacyData } from '../src/legacy.js';
import { DEFAULT_NOTIFY, notificationPlan, parseLooseTime, parseNotifyPrefs } from '../src/notify.js';
import { courseProgress, courseResume, coursePlaybackPatch, formatClock, youtubeRef } from '../src/tools.js';

const course = (over: Partial<LegacyCourse> = {}): LegacyCourse => ({ id: 'c1', topic: 'Inglés', title: 'Inglés básico', url: 'https://www.youtube.com/watch?v=abcdefghijk', status: 'pendiente', notes: '', ...over });

describe('progreso de los cursos', () => {
  it('reconoce videos y listas de YouTube', () => {
    expect(youtubeRef('https://www.youtube.com/watch?v=abcdefghijk&t=1m30s')).toEqual({ video: 'abcdefghijk', list: '', start: 90 });
    expect(youtubeRef('https://youtu.be/abcdefghijk?t=45')).toEqual({ video: 'abcdefghijk', list: '', start: 45 });
    expect(youtubeRef('https://m.youtube.com/shorts/abcdefghijk')?.video).toBe('abcdefghijk');
    expect(youtubeRef('https://www.youtube.com/playlist?list=PLabcdefghijkl')).toEqual({ video: '', list: 'PLabcdefghijkl', start: 0 });
    expect(youtubeRef('https://www.youtube.com/@canal')).toBeNull();
    expect(youtubeRef('https://www.udemy.com/course/ingles/')).toBeNull();
  });

  it('guarda dónde se pausó y lo da por terminado al llegar al final', () => {
    const now = new Date('2026-10-31T10:00:00.000Z');
    const p = coursePlaybackPatch(course(), { position: 725.4, duration: 2710 }, now);
    expect(p).toEqual({ position: 725, duration: 2710, progress: 27, lastAt: now.toISOString(), status: 'curso' });
    expect(legacyPatchSchemas.courses.safeParse(p).success).toBe(true);
    expect(coursePlaybackPatch(course(), { position: 2700, duration: 2710 }, now)).toMatchObject({ progress: 100, status: 'hecho' });
    // En una lista cuenta el video en el que va.
    expect(coursePlaybackPatch(course(), { position: 300, duration: 600, video: 'zyxwvutsrqp', index: 2, count: 10 }, now)).toMatchObject({ progress: 25, video: 'zyxwvutsrqp', status: 'curso' });
    expect(courseResume({ ...course(), ...p } as LegacyCourse)).toBe('Vas en 12:05 de 45:10');
    expect(courseResume(course({ spot: 'Lección 12', progress: 40 }))).toBe('Lección 12 · 40 %');
    expect(courseProgress(course({ status: 'hecho' }))).toBe(100);
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('acepta cursos y clases sin los campos nuevos y valida los nuevos', () => {
    expect(legacyItemSchemas.courses.safeParse(course()).success).toBe(true);
    expect(legacyItemSchemas.courses.safeParse(course({ progress: 140 })).success).toBe(false);
    expect(legacyItemSchemas.classes.parse({ id: 'k', day: 1, start: '18:00', end: '19:00', title: 'Inglés', course: 'c1' })).toMatchObject({ course: 'c1' });
    expect(legacyItemSchemas.classes.parse({ id: 'k', day: 1, start: '18:00', end: '19:00', title: 'Física' })).not.toHaveProperty('course');
  });
});

describe('avisos del teléfono', () => {
  const data = {
    classes: [
      { id: 'k1', day: 1, start: '08:05', end: '09:00', title: 'Física', room: 'B-3', color: '#4F7CFF', subject: '' },
      { id: 'k2', day: 1, start: '00:05', end: '01:00', title: 'Madrugada', room: '', color: '#4F7CFF', subject: '' },
      { id: 'k3', day: 3, start: '18:00', end: '19:00', title: 'Inglés básico', room: '', color: '#4F7CFF', subject: '', course: 'c1' },
    ],
    courses: [course()],
    reminders: [
      { id: 'r1', day: 14, title: 'Dentista', when: '4:30 pm', color: '#4F7CFF', icon: 'doc', on: true },
      { id: 'r2', day: 3, title: 'Apagado', when: '', color: '#4F7CFF', icon: 'doc', on: false },
    ],
    tasks: [
      { id: 't1', title: 'Entregar ensayo', pri: 'alta', time: '17:30', rem: true, done: false, tags: '' },
      { id: 't2', title: 'Sin aviso', pri: 'alta', time: '17:30', rem: false, done: false, tags: '' },
      { id: 't3', title: 'Ya pasó', pri: 'alta', time: '06:00', rem: true, done: false, tags: '' },
    ],
  } as unknown as LegacyData;
  const now = new Date(2026, 9, 31, 12, 0);

  it('apagado no programa nada', () => {
    expect(notificationPlan(data, DEFAULT_NOTIFY, now)).toEqual([]);
  });

  it('programa clases (antes de empezar), cursos del horario, recordatorios y tareas de hoy', () => {
    const plan = notificationPlan(data, { ...DEFAULT_NOTIFY, enabled: true }, now);
    expect(plan.map((p) => p.id)).toEqual(['task-t1', 'class-k1', 'class-k2', 'class-k3', 'rem-r1']);
    expect(plan.find((p) => p.id === 'class-k1')).toMatchObject({ title: 'Física en 10 min', body: 'De 08:05 a 09:00 · B-3', trigger: { kind: 'weekly', weekday: 1, hour: 7, minute: 55 } });
    // 10 minutos antes de las 00:05 del lunes es el domingo.
    expect(plan.find((p) => p.id === 'class-k2')?.trigger).toEqual({ kind: 'weekly', weekday: 7, hour: 23, minute: 55 });
    expect(plan.find((p) => p.id === 'class-k3')).toMatchObject({ title: 'Curso en 10 min: Inglés básico', url: '/cursos?abrir=c1' });
    expect(plan.find((p) => p.id === 'rem-r1')?.trigger).toEqual({ kind: 'monthly', day: 14, hour: 16, minute: 30 });
    expect(plan.find((p) => p.id === 'task-t1')?.trigger).toEqual({ kind: 'date', at: new Date(2026, 9, 31, 17, 30).toISOString() });
    expect(notificationPlan(data, { ...DEFAULT_NOTIFY, enabled: true, classes: false, tasks: false }, now).map((p) => p.id)).toEqual(['rem-r1']);
  });

  it('lee preferencias y horas sueltas con cuidado', () => {
    expect(parseNotifyPrefs({ enabled: true, classLead: 7 })).toEqual({ ...DEFAULT_NOTIFY, enabled: true });
    expect(parseLooseTime('14:00')).toEqual({ hour: 14, minute: 0 });
    expect(parseLooseTime('9h')).toEqual({ hour: 9, minute: 0 });
    expect(parseLooseTime('12 am')).toEqual({ hour: 0, minute: 0 });
    expect(parseLooseTime('el martes')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { AVATARS, AVATAR_IDS, avatarById } from '../src/avatars.js';
import { coupleCreateInput, coupleProgress, pairKey } from '../src/couple.js';
import { courseLanguageLabel, courseLanguageValue, legacyItemSchemas } from '../src/legacy.js';
import { DEFAULT_NOTIFY, expandNotificationPlan, notificationPlan, parseNotifyPrefs, positiveMessage, waterTimes } from '../src/notify.js';
import { profileInputSchema } from '../src/schemas.js';
import { activityCount, detectLanguage, duplicateCourseGroups, findDuplicateCourse, numberedUnit, unitWord } from '../src/tools.js';

describe('idioma de los cursos', () => {
  it('detecta el idioma del título mientras se escribe', () => {
    expect(detectLanguage('Curso completo de React desde cero')).toBe('es');
    expect(detectLanguage('Learn React from scratch: the complete guide')).toBe('en');
    expect(detectLanguage('Curso de inglés básico para principiantes')).toBe('es');
    expect(detectLanguage('Aprenda programação do zero com Python')).toBe('pt');
    expect(detectLanguage('Apprendre le français pour les débutants')).toBe('fr');
    expect(detectLanguage('日本語のコース')).toBe('ja');
    expect(detectLanguage('한국어 기초')).toBe('ko');
    expect(detectLanguage('Русский язык')).toBe('ru');
    expect(detectLanguage('React')).toBeNull();
    expect(detectLanguage('')).toBeNull();
  });

  it('acepta más idiomas y uno escrito a mano', () => {
    expect(courseLanguageLabel('pt')).toBe('Portugués');
    expect(courseLanguageLabel('Catalán')).toBe('Catalán');
    expect(courseLanguageValue('inglés')).toBe('en');
    expect(courseLanguageValue('Ingles')).toBe('en');
    expect(courseLanguageValue('Catalán')).toBe('Catalán');
    const base = { id: 'c1', topic: 'X', title: '', url: '', status: 'pendiente', notes: '' };
    expect(legacyItemSchemas.courses.safeParse({ ...base, language: 'Catalán' }).success).toBe(true);
    expect(legacyItemSchemas.courses.safeParse({ ...base, language: 'x'.repeat(41) }).success).toBe(false);
  });

  it('nombra las unidades en el idioma del curso', () => {
    expect(unitWord('pt')).toBe('Unidade');
    expect(unitWord('Catalán')).toBe('Unidad');
    expect(numberedUnit(2, 'Verbes', 'fr')).toBe('Unité 2: Verbes');
  });
});

describe('cursos repetidos', () => {
  const list = [
    { id: 'a', title: 'React desde cero', url: 'https://www.youtube.com/watch?v=abcdefghijk' },
    { id: 'b', title: 'Inglés básico', url: 'https://platzi.com/cursos/ingles/' },
    { id: 'c', title: 'Otro', url: '' },
  ];
  it('nota el mismo enlace (aunque cambie la forma) o el mismo nombre', () => {
    expect(findDuplicateCourse(list, { url: 'https://youtu.be/abcdefghijk?t=40' })?.course.id).toBe('a');
    expect(findDuplicateCourse(list, { url: 'https://platzi.com/cursos/ingles' })?.by).toBe('enlace');
    expect(findDuplicateCourse(list, { title: 'ingles  BASICO' })).toMatchObject({ by: 'nombre', course: { id: 'b' } });
    expect(findDuplicateCourse(list, { title: 'Inglés básico' }, 'b')).toBeNull();
    expect(findDuplicateCourse(list, { title: 'Nuevo' })).toBeNull();
  });
  it('agrupa los repetidos para avisar en la lista', () => {
    expect(duplicateCourseGroups([...list, { id: 'd', title: 'React desde cero', url: '' }]).map((g) => g.map((c) => c.id))).toEqual([['a', 'd']]);
    expect(duplicateCourseGroups(list)).toEqual([]);
  });
});

describe('actividades de una lección', () => {
  it('se validan y se cuentan', () => {
    const lesson = { id: 'l1', title: 'Clase 1', activities: [{ id: 'x1', kind: 'video', title: 'Ver el video', done: true }, { id: 'x2', kind: 'examen', title: 'Examen final' }] };
    const base = { id: 'c1', topic: 'X', title: '', url: '', status: 'pendiente', notes: '', lessons: [lesson] };
    expect(legacyItemSchemas.courses.safeParse(base).success).toBe(true);
    expect(legacyItemSchemas.courses.safeParse({ ...base, lessons: [{ ...lesson, activities: [{ id: 'x', kind: 'baile', title: 'a' }] }] }).success).toBe(false);
    expect(activityCount(lesson)).toEqual({ done: 1, total: 2 });
  });
});

describe('cuidarte: comidas, agua y mensajes positivos', () => {
  it('reparte el agua entre las horas elegidas', () => {
    expect(waterTimes('08:00', '14:00', 2)).toEqual(['08:00', '10:00', '12:00', '14:00']);
    expect(waterTimes('14:00', '08:00', 2)).toEqual([]);
  });
  it('programa comidas, agua y un mensaje por día', () => {
    const prefs = { ...DEFAULT_NOTIFY, enabled: true, classes: false, reminders: false, tasks: false, routines: false, water: false };
    const plan = notificationPlan({}, prefs);
    expect(plan.filter((p) => p.id.startsWith('meal-')).map((p) => p.title)).toEqual(['Hora del desayuno', 'Hora del almuerzo', 'Hora de la cena']);
    expect(plan.find((p) => p.id === 'meal-cena')?.trigger).toEqual({ kind: 'daily', hour: 19, minute: 30 });
    expect(plan.filter((p) => p.id.startsWith('cheer-'))).toHaveLength(7);
    const now = new Date(2026, 10, 12, 7, 0);
    const alarms = expandNotificationPlan(plan, now, 2);
    expect(alarms.filter((a) => a.title === 'Hora del desayuno')).toHaveLength(2);
  });
  it('lee las preferencias guardadas antes de existir estas opciones', () => {
    const p = parseNotifyPrefs({ enabled: true, mealTimes: { cena: '21:00', desayuno: 'mal' }, waterEvery: 7 });
    expect(p.mealTimes).toMatchObject({ cena: '21:00', desayuno: '08:00' });
    expect(p.waterEvery).toBe(2);
    expect(positiveMessage(new Date(2026, 0, 1))).toBeTruthy();
  });
});

describe('perfil y pareja', () => {
  it('guarda un personaje como foto de perfil', () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(8);
    expect(avatarById('gato')?.name).toBe('Gato');
    expect(profileInputSchema.safeParse({ avatar: AVATAR_IDS[1] }).success).toBe(true);
    expect(profileInputSchema.safeParse({ avatar: '' }).success).toBe(true);
    expect(profileInputSchema.safeParse({ avatar: 'dragon' }).success).toBe(false);
  });
  it('valida lo que la pareja comparte', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
    expect(coupleCreateInput.safeParse({ kind: 'meta', data: { title: 'Viajar a Mérida' } }).success).toBe(true);
    expect(coupleCreateInput.safeParse({ kind: 'emprendimiento', data: { name: 'Tienda', stage: 'en-marcha', tasks: [{ id: 't', name: 'Logo' }] } }).success).toBe(true);
    expect(coupleCreateInput.safeParse({ kind: 'foto', data: {}, image: 'nope', thumb: 'nope' }).success).toBe(false);
    expect(coupleProgress([{ done: true }, { done: false }])).toBe(50);
  });
});

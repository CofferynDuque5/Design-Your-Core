import { describe, expect, it } from 'vitest';
import { guessActivityKind, materialsFromText, nextSubtopicNumber, pastedLines, subtopicLessons, subtopicNumber, unitNumber, type CourseLesson } from '../src/index.js';

let n = 0;
const id = () => `id${++n}`;

describe('subtemas numerados', () => {
  it('lee el número de un subtema y de una unidad', () => {
    expect(subtopicNumber('1.2: Generic Programming')).toBe('1.2');
    expect(subtopicNumber('1.2 Generic')).toBe('1.2');
    expect(subtopicNumber('Introducción')).toBeNull();
    expect(unitNumber('Unit 3: Templates')).toBe(3);
    expect(unitNumber('Unidad 1')).toBe(1);
    expect(unitNumber('Repaso')).toBeNull();
  });

  it('sigue la numeración de la unidad', () => {
    const lessons: CourseLesson[] = [
      { id: 'a', title: '1.1: Programming Paradigms', unit: 'Unit 1: Generic Programming' },
      { id: 'b', title: '1.2: Generic Programming', unit: 'Unit 1: Generic Programming' },
      { id: 'c', title: '2.1: Otra', unit: 'Unit 2' },
    ];
    expect(nextSubtopicNumber('Unit 1: Generic Programming', lessons)).toBe('1.3');
    expect(nextSubtopicNumber('Unit 2', lessons)).toBe('2.2');
    expect(nextSubtopicNumber('Unit 3', lessons)).toBe('3.1');
    expect(nextSubtopicNumber('Sin número', lessons)).toBeNull();
  });

  it('añade varios subtemas de una vez, numerados solos', () => {
    const before: CourseLesson[] = [{ id: 'a', title: '1.1: Paradigms', unit: 'Unit 1' }];
    const out = subtopicLessons('Generic Programming\n\n- Templates https://learn.saylor.org/course/view.php?id=1\n• Iterators', 'Unit 1', before, id);
    expect(out.map((l) => l.title)).toEqual(['1.2: Generic Programming', '1.3: Templates', '1.4: Iterators']);
    expect(out[1].url).toBe('https://learn.saylor.org/course/view.php?id=1');
    expect(out.every((l) => l.unit === 'Unit 1')).toBe(true);
  });

  it('respeta los números que ya trae lo pegado y sigue desde ahí', () => {
    const out = subtopicLessons('1.5 Containers\nAlgorithms\n2.1: Otra unidad', 'Unidad 1', [], id);
    expect(out.map((l) => l.title)).toEqual(['1.5: Containers', '1.6: Algorithms', '2.1: Otra unidad']);
  });

  it('sin unidad numerada no inventa números', () => {
    expect(subtopicLessons('Intro\nClase 2', '', [], id).map((l) => l.title)).toEqual(['Intro', 'Clase 2']);
  });

  it('no pasa del máximo de lecciones', () => {
    expect(subtopicLessons('a\nb\nc', 'Unit 1', [], id, 2)).toHaveLength(2);
  });
});

describe('materiales de un subtema', () => {
  it('adivina el tipo por las palabras o el enlace', () => {
    expect(guessActivityKind('Watch this lecture', 'https://www.youtube.com/watch?v=abcdefghijk')).toBe('video');
    expect(guessActivityKind('Lecture 3', 'https://youtu.be/abcdefghijk')).toBe('video');
    expect(guessActivityKind('Read this article')).toBe('lectura');
    expect(guessActivityKind('Complete this exercise')).toBe('ejercicio');
    expect(guessActivityKind('Ejercicios de práctica')).toBe('ejercicio');
    expect(guessActivityKind('Explore this webpage')).toBe('pagina');
    expect(guessActivityKind('C++ Templates', 'https://cplusplus.com/doc/tutorial/templates/')).toBe('pagina');
    expect(guessActivityKind('Notes', 'https://x.org/a.pdf')).toBe('lectura');
    expect(guessActivityKind('Unit 1 Quiz')).toBe('cuestionario');
    expect(guessActivityKind('Final Exam')).toBe('examen');
    expect(guessActivityKind('Algo')).toBe('otro');
  });

  it('pega varios materiales con su enlace', () => {
    const acts = materialsFromText('Read this: Generic Programming - https://a.org/gp\nhttps://www.youtube.com/watch?v=abcdefghijk\nComplete this exercise', id);
    expect(acts.map((a) => [a.kind, a.title, a.url])).toEqual([
      ['lectura', 'Read this: Generic Programming', 'https://a.org/gp'],
      ['video', 'youtube.com/watch', 'https://www.youtube.com/watch?v=abcdefghijk'],
      ['ejercicio', 'Complete this exercise', undefined],
    ]);
  });

  it('limpia viñetas y líneas vacías', () => {
    expect(pastedLines('  - uno\n\n* dos\n[ ] tres')).toEqual([{ title: 'uno' }, { title: 'dos' }, { title: 'tres' }]);
  });
});

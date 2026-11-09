import { describe, expect, it } from 'vitest';
import {
  addDays,
  consistencyDay,
  consistencyGrid,
  consistencyLevel,
  consistencyRange,
  consistencyStats,
  dayFocus,
  dayPlan,
  phraseOfDay,
  streakNudge,
  upcoming,
  nextUnitNumber,
  numberedUnit,
  unitSummary,
  type ConsistencyDay,
} from '../src/index.js';

const today = '2026-11-11'; // miércoles
const day = (offset: number, done: number, total = 3): ConsistencyDay => ({ date: addDays(today, offset), done, total });

describe('constancia', () => {
  it('el mapa va del lunes de hace 11 semanas a hoy', () => {
    const r = consistencyRange(today);
    expect(r).toEqual({ from: '2026-08-24', to: today });
    const grid = consistencyGrid([], today);
    expect(grid).toHaveLength(12);
    expect(grid[0][0]?.date).toBe('2026-08-24');
    expect(grid[11][2]?.date).toBe(today);
    expect(grid[11][3]).toBeNull();
  });

  it('cuenta hábitos cumplidos y el check-in', () => {
    expect(consistencyDay(today, [{ done: true }, { done: false }], true)).toEqual({ date: today, done: 2, total: 3 });
    expect(consistencyLevel({ done: 0, total: 3 })).toBe(0);
    expect(consistencyLevel({ done: 1, total: 4 })).toBe(1);
    expect(consistencyLevel({ done: 3, total: 3 })).toBe(4);
  });

  it('la racha sigue viva si hoy aún no cuenta', () => {
    const days = [day(-4, 0), day(-3, 1), day(-2, 2), day(-1, 3, 3), day(0, 0)];
    const s = consistencyStats(days, today);
    expect(s).toMatchObject({ streak: 3, best: 3, todayDone: false, activeDays: 3, perfectDays: 1, next: { target: 7, left: 4 }, reached: [3] });
    expect(streakNudge(s)).toBe('Aún estás a tiempo: marca algo hoy y tu racha sube a 4.');
  });

  it('guarda la mejor racha aunque se rompa', () => {
    const days = [...Array.from({ length: 8 }, (_, i) => day(-20 + i, 1)), day(-5, 0), day(0, 2)];
    const s = consistencyStats(days, today);
    expect(s.streak).toBe(1);
    expect(s.best).toBe(8);
    expect(s.reached).toEqual([3, 7]);
    expect(s.weekActive).toBe(1);
    expect(streakNudge(s)).toBe('Hoy ya cuenta. Mañana repite y empieza tu racha.');
    expect(streakNudge({ streak: 0, best: 0, todayDone: false, next: null })).toMatch(/así empieza tu racha/);
  });

  it('una frase por día', () => {
    expect(phraseOfDay(today)).toBe(phraseOfDay(today));
    expect(phraseOfDay(today)).not.toBe(phraseOfDay(addDays(today, 1)));
  });
});

describe('plan del día', () => {
  const now = new Date(2026, 10, 11, 14, 10); // miércoles 14:10
  const data = {
    classes: [
      { id: 'c1', day: 3, start: '09:00', end: '10:00', title: 'Inglés', room: '', color: '#000000', subject: '' },
      { id: 'c2', day: 3, start: '15:00', end: '16:00', title: '', room: '', color: '#000000', subject: '', course: 'k1' },
      { id: 'c3', day: 4, start: '15:00', end: '16:00', title: 'Otro día', room: '', color: '#000000', subject: '' },
    ],
    courses: [{ id: 'k1', title: 'React desde cero', status: 'curso' }],
    routines: [{ id: 'r1', title: 'Entrenar', time: '18:00', days: '135', icon: '', sound: false, enabled: true }],
    tasks: [
      { id: 't1', title: 'Llamar al cliente', pri: 'alta', time: '14:00', rem: false, done: false, tags: '' },
      { id: 't2', title: 'Hecha', pri: 'media', time: '16:00', rem: false, done: true, tags: '' },
    ],
  } as never;

  it('junta horario, cursos, rutinas y agenda en orden', () => {
    const plan = dayPlan(data, now);
    expect(plan.map((i) => [i.time, i.title, i.kind])).toEqual([
      ['09:00', 'Inglés', 'clase'],
      ['14:00', 'Llamar al cliente', 'tarea'],
      ['15:00', 'React desde cero', 'curso'],
      ['18:00', 'Entrenar', 'rutina'],
    ]);
    expect(upcoming(plan, now).map((i) => i.title)).toEqual(['React desde cero', 'Entrenar']);
  });
});

describe('enfoque del día', () => {
  it('elige el siguiente paso del proyecto que toca terminar primero', () => {
    const data = {
      projects: [
        { id: 'p1', title: 'Tienda Lumen', status: 'curso', todos: [{ id: 'a', name: 'Pasarela de pago', done: true, kind: 'falta' }, { id: 'b', name: 'Fotos', done: false, kind: 'mejora' }, { id: 'c', name: 'Envíos', done: false, kind: 'falta' }] },
      ],
    } as never;
    expect(dayFocus(data, [])).toMatchObject({ title: 'Envíos', detail: 'Siguiente paso de «Tienda Lumen», el proyecto que toca terminar primero.', url: '/proyectos' });
  });

  it('sin proyectos, la tarea más urgente y luego el primer hábito pendiente', () => {
    const tasks = { tasks: [{ id: 't1', title: 'Leer', pri: 'baja', time: null, rem: false, done: false, tags: '' }, { id: 't2', title: 'Pagar luz', pri: 'alta', time: '10:00', rem: false, done: false, tags: '' }] } as never;
    expect(dayFocus(tasks, [])?.title).toBe('Pagar luz');
    expect(dayFocus({} as never, [{ title: 'Caminar', done: true }, { title: 'Agua', done: false }])?.title).toBe('Agua');
    expect(dayFocus({} as never, [])).toBeNull();
  });
});

describe('unidades numeradas', () => {
  it('propone el número siguiente y arma el nombre', () => {
    expect(nextUnitNumber([])).toBe(1);
    expect(nextUnitNumber(['Unit 1: Computer Programming', 'Unit 5: Conditionals'])).toBe(6);
    expect(nextUnitNumber(['Intro', 'Repaso'])).toBe(3);
    expect(numberedUnit(6, 'Bucles')).toBe('Unidad 6: Bucles');
    expect(numberedUnit(6, '  ')).toBe('Unidad 6');
    expect(numberedUnit(6, 'Unidad 7: Arrays')).toBe('Unidad 7: Arrays');
    expect(unitSummary({ units: ['Unidad 1'], lessons: [{ id: 'a', title: 'x', unit: 'Unidad 1', done: true }, { id: 'b', title: 'y', unit: 'Unidad 1', done: false }] as never })).toEqual([{ unit: 'Unidad 1', done: 1, total: 2 }]);
  });
});

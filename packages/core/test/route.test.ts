import { describe, expect, it } from 'vitest';
import { courseLevel, courseRoute, handoffClasses, planTopics, type LegacyCourse, type LegacyData } from '../src/index.js';

const titles = [
  'Redux Toolkit avanzado',
  'React desde cero',
  'Next.js 15 completo',
  'Patrones de diseño en React',
  'Hooks en React',
  'Testing con Jest y React Testing Library',
  'JavaScript moderno para React',
  'React Router: rutas y navegación',
  'Proyecto: clon de Netflix con React',
  'Formularios con React Hook Form',
  'TypeScript con React',
  'Context API y estado global',
  'Introducción a React para principiantes',
  'Performance y optimización en React',
  'React Query (TanStack) para consumir APIs',
  'Animaciones con Framer Motion',
  'React intermedio: componentes reutilizables',
  'React Native desde cero',
  'Arquitectura de aplicaciones React escalables',
  'Curso de React parte 2',
];
const react: LegacyCourse[] = titles.map((title, i) => ({ id: `r${i}`, topic: 'React', title, url: '', status: 'pendiente', notes: '' }));

describe('ruta de un tema', () => {
  it('ordena 20 cursos de React de lo básico a lo avanzado sin que nadie decida', () => {
    const route = courseRoute(react).map((c) => c.title);
    expect(route.slice(0, 3)).toEqual(['JavaScript moderno para React', 'React desde cero', 'Introducción a React para principiantes']);
    const at = (t: string) => route.indexOf(t);
    expect(at('Hooks en React')).toBeLessThan(at('Context API y estado global'));
    expect(at('Context API y estado global')).toBeLessThan(at('TypeScript con React'));
    expect(at('TypeScript con React')).toBeLessThan(at('Patrones de diseño en React'));
    expect(at('Redux Toolkit avanzado')).toBeGreaterThan(at('Formularios con React Hook Form'));
    expect(route.at(-1)).toMatch(/Arquitectura|Patrones|Performance/);
    expect(route.indexOf('React Native desde cero')).toBeGreaterThan(route.indexOf('Hooks en React'));
    expect(courseLevel({ title: 'Curso de React parte 2', notes: '', url: '' })).toMatchObject({ level: 'intermedio', part: 2 });
    expect(courseLevel({ title: '', notes: '', url: 'https://www.udemy.com/course/react-avanzado/' }).level).toBe('avanzado');
  });

  it('primero lo que ya empezaste y al final lo terminado', () => {
    const list = [{ ...react[0], status: 'curso', progress: 30 }, { ...react[1], status: 'hecho' }, react[12]] as LegacyCourse[];
    expect(courseRoute(list).map((c) => c.id)).toEqual(['r0', 'r12', 'r1']);
  });

  it('al terminar un curso, sus clases pasan al siguiente del tema', () => {
    const data = { courses: react.map((c, i) => (i === 6 ? { ...c, status: 'hecho' } : c)), classes: [{ id: 'k', day: 1, start: '18:00', end: '19:00', title: 'JS', room: '', color: '#000000', subject: '', course: 'r6' }] } as unknown as LegacyData;
    expect(handoffClasses(data, 'r6')).toEqual({ next: expect.objectContaining({ id: 'r1' }), patches: [{ id: 'k', patch: { course: 'r1', title: 'React desde cero' } }] });
  });

  it('el horario por temas estudia un curso a la vez y calcula todo el tema', () => {
    const data = {
      courses: [...react.map((c, i) => ({ ...c, length: (i + 1) * 3600 })), { id: 'en', topic: 'Inglés', title: 'Inglés básico', url: '', status: 'curso', notes: '', length: 10 * 3600 }],
      classes: [],
    } as unknown as LegacyData;
    const plan = planTopics(data, ['React', 'Inglés'], { days: '12345', from: '18:00', to: '20:00', session: 60, weekly: 10 }, new Date('2026-11-02T12:00:00Z'));
    expect(new Set(plan.sessions.map((s) => s.courseId))).toEqual(new Set(['r6', 'en']));
    const r = plan.topics.find((t) => t.topic === 'React')!;
    expect(r).toMatchObject({ courseId: 'r6', count: 20, unknown: 0 });
    // React: 210 h en total, con la mayoría de las 10 sesiones.
    expect(r.perWeek).toBeGreaterThan(plan.topics[1].perWeek);
    expect(r.weeks).toBe(Math.ceil(210 / r.perWeek));
  });
});

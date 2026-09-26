import { CHALLENGES, localDayKey } from '@dyc/core';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { auth } from '../lib/api';
import { dashboard, fakeFetch, profile, tokens } from './fakeApi';

// Lectores de pantalla (VoiceOver, TalkBack): cada control tocable de cada
// pantalla tiene un rol y un nombre que se pueda leer en voz alta.

const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();

type Node = NonNullable<typeof screen.UNSAFE_root>;

const textOf = (n: Node): string =>
  n.children.map((c: Node | string) => (typeof c === 'string' ? c : textOf(c))).join('').trim();

function problems(): string[] {
  const out: string[] = [];
  const tappable = screen.UNSAFE_root.findAll(
    (n) => typeof n.type === 'string' && typeof n.props.onClick === 'function' && n.props.accessible !== false,
  );
  for (const n of tappable) {
    const role = n.props.accessibilityRole ?? n.props.role;
    const name = n.props.accessibilityLabel ?? n.props['aria-label'] ?? textOf(n);
    if (!role || role === 'none') out.push(`sin rol: "${name}"`);
    if (!name) out.push(`sin nombre: rol ${role}`);
  }
  for (const n of screen.UNSAFE_root.findAll((n) => (n.type as unknown) === 'TextInput')) {
    if (!n.props.accessibilityLabel && !n.props['aria-label'] && !n.props['aria-labelledby']) out.push(`campo sin etiqueta: "${n.props.placeholder ?? ''}"`);
  }
  return out;
}

const TODAY = localDayKey(new Date());
const LEGACY = {
  blocks: [{ id: 'b1', label: 'Estudiar', sub: '', start: 9, dur: 1, kind: 'study' }],
  tasks: [{ id: 't1', title: 'Entregar el ensayo', pri: 'alta', time: '10:00', rem: true, done: false, tags: '' }],
  todos: [{ id: 'd1', title: 'Llamar al dentista', done: false }],
  subtasks: [{ id: 's1', todoId: 'd1', title: 'Buscar el número', done: false }],
  reminders: [{ id: 'r1', day: Number(TODAY.slice(8)), title: 'Pagar la luz', when: '', color: '#0FA968', icon: 'doc', on: true }],
  classes: [{ id: 'c1', day: 3, start: '10:00', end: '11:00', title: 'Física', room: 'B-2', color: '#4F7CFF', subject: '' }],
  focus: [{ id: 'f1', mode: 'focus', seconds: 1500, dateKey: TODAY }],
  subjects: [{ id: 'm1', name: 'Cálculo', teacher: 'Dra. Morales', room: 'A-201', color: '#4F7CFF', nextClass: 'Lunes 8:00', topics: [{ id: 't1', name: 'Límites', done: true }] }],
  projects: [{ id: 'p1', title: 'Ensayo de Historia', subject: 'Cálculo', deadline: '20 SEP', status: 'curso', color: '#4F7CFF', milestones: [{ id: 'h1', name: 'Borrador', date: '', done: false }] }],
  roadmaps: [{ id: 'r1', name: 'Ingeniería', color: '#8B5CF6', steps: [{ id: 's1', name: 'Álgebra', done: true }, { id: 's2', name: 'Cálculo I', done: false }] }],
  notebooks: [{ id: 'n1', title: 'Apuntes de cálculo', category: 'Universidad', subject: 'Cálculo', topic: 'Derivadas', color: '#4F7CFF', emoji: '🧮' }],
  noteBoxes: [
    { id: 'x1', notebookId: 'n1', title: 'Regla de la cadena', text: 'Derivar fuera por dentro', color: '#FFF7D6', kind: 'text', lang: '' },
    { id: 'x2', notebookId: 'n1', title: 'derivada.py', text: 'def d(f): pass', color: '#1e1e2e', kind: 'code', lang: 'python' },
  ],
  content: [{ id: 'v1', title: 'Probé 100 apps', stage: 'guion', platform: 'youtube', notes: '', script: 'Gancho', due: '12 sep' }],
  ideas: [{ id: 'i1', title: 'App de apuntes', body: '', category: 'app', tags: 'estudio' }],
  transactions: [{ id: 'x1', date: TODAY, amount: 45.5, type: 'expense', category: 'Comida', note: 'Mercado' }],
  budget: { monthly: 500 },
  goals: [{ id: 'g1', title: 'Publicar 8 videos', target: 8, current: 3, unit: 'videos', deadline: '', category: 'creador', done: false }],
  pets: [{ id: 'pet1', name: 'Luna', species: 'cat', note: '' }],
  petCares: [{ id: 'pc1', petId: 'pet1', kind: 'comida', title: 'Darle de comer', time: '08:00', days: '1234567', sound: true, enabled: true, lastDone: '' }],
  period: [{ id: 'pd1', date: TODAY, flow: 'medium', symptoms: 'Cólicos', mood: '', note: '' }],
  workouts: [{ id: 'w1', date: TODAY, plan: 'Core express', minutes: 15 }],
  sleep: [{ id: 'z1', date: TODAY, bedtime: '23:30', waketime: '07:15', quality: 4, note: '' }],
  journal: [{ id: 'j1', date: '2026-09-19', mood: '😄', gratitude: '', note: 'Buen día' }],
  routines: [{ id: 'rt1', title: 'Tomar vitaminas', time: '08:00', days: '1234567', icon: 'bell', sound: true, enabled: true }],
  meals: [{ id: 'ml1', label: 'Desayuno', time: '07:30', note: 'Avena', dateKey: TODAY }],
};

const HABIT = { id: 'h1', title: 'Caminar 10 minutos', pillar: 'movimiento', days: '1111111', startsOn: '2026-09-01', archived: false, createdAt: '2026-09-01T00:00:00.000Z', recent: [] };
const ACTIVE = {
  id: 'c1', key: CHALLENGES[0].key, pillar: CHALLENGES[0].pillar, title: CHALLENGES[0].title, description: CHALLENGES[0].description, level: CHALLENGES[0].level,
  status: 'active', startedOn: '2026-09-21', endsOn: '2026-09-27', durationDays: 7, dayNumber: 3, doneDays: 1, doneToday: false, log: [],
};

describe('accesibilidad de la app móvil', () => {
  beforeEach(async () => {
    await auth.signOut();
    reset();
  });

  it('las pantallas de acceso tienen controles con nombre', async () => {
    fakeFetch({});
    renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByText('Hola de nuevo');
    expect(problems()).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'Crear una cuenta' }));
    await screen.findByText('Crea tu cuenta');
    expect(problems()).toEqual([]);
  });

  it('cada pantalla de la app tiene controles con rol y nombre', async () => {
    fakeFetch({
      'POST /api/v2/auth/session': () => tokens(),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/dashboard': () => dashboard({ challenges: [ACTIVE as never] }),
      'GET /api/v2/checkins': () => ({ from: '2026-09-23', to: '2026-09-23', checkIns: [] }),
      'GET /api/v2/habits': () => ({ today: '2026-09-23', habits: [HABIT] }),
      'GET /api/v2/challenges': () => ({ today: '2026-09-23', active: [ACTIVE], past: [] }),
      'GET /api/v2/challenges/catalog': () => ({ challenges: CHALLENGES }),
      'GET /api/v2/modules': () => ({ data: LEGACY, updatedAt: null }),
    });
    renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByText('Hola de nuevo');
    fireEvent.changeText(screen.getByLabelText('Correo'), 'ana@example.com');
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    await screen.findByText('Hábitos de hoy');
    expect(problems()).toEqual([]);

    for (const [path, marker] of [
      ['/progreso', 'Tus pilares'],
      ['/retos', 'Catálogo'],
      ['/habitos', 'Caminar 10 minutos'],
      ['/perfil', 'Apariencia'],
      ['/check-in', 'Ánimo y mente'],
      ['/mas', 'Organización'],
      ['/agenda', 'Estudiar'],
      ['/agenda?vista=tareas', 'Entregar el ensayo'],
      ['/pendientes', 'Llamar al dentista'],
      ['/calendario', 'Pagar la luz'],
      ['/horario', 'Física'],
      ['/enfoque', 'Últimas sesiones'],
      ['/materias', 'Dra. Morales'],
      ['/proyectos', 'Ensayo de Historia'],
      ['/roadmaps', 'Ingeniería'],
      ['/cuadernos', 'Apuntes de cálculo'],
      ['/cuadernos/n1', 'Cajitas'],
      ['/contenido', 'Probé 100 apps'],
      ['/ideas', 'App de apuntes'],
      ['/finanzas', 'Gastos por categoría'],
      ['/metas', 'Publicar 8 videos'],
      ['/mascotas', 'Darle de comer'],
      ['/ciclo', 'Tus últimos periodos'],
      ['/ejercicio', 'Historial'],
      ['/sueno', 'Horas por noche'],
      ['/diario', 'Buen día'],
      ['/rutina', 'Tomar vitaminas'],
    ] as const) {
      await act(async () => router.push(path));
      expect(await screen.findAllByText(marker)).not.toHaveLength(0);
      expect({ path, problems: problems() }).toEqual({ path, problems: [] });
    }

    // Hojas y paneles de las herramientas.
    await act(async () => router.push('/pendientes'));
    fireEvent.press(await screen.findByRole('button', { name: /^Pasos y opciones de «Llamar al dentista»/ }));
    expect(await screen.findByText('Buscar el número')).toBeOnTheScreen();
    expect({ path: 'pendientes abierto', problems: problems() }).toEqual({ path: 'pendientes abierto', problems: [] });
    // Temas, hitos y la confirmación de borrar dentro de una hoja.
    for (const [path, button, marker] of [
      ['/materias', 'Temas de «Cálculo»: 1 de 1 vistos', 'Límites'],
      ['/proyectos', 'Hitos de «Ensayo de Historia»: 0 de 1 hechos', 'Borrador'],
    ] as const) {
      await act(async () => router.push(path));
      fireEvent.press(await screen.findByRole('button', { name: button }));
      expect(await screen.findAllByText(marker)).not.toHaveLength(0);
      expect({ path: `${path} (abierto)`, problems: problems() }).toEqual({ path: `${path} (abierto)`, problems: [] });
    }
    for (const [path, button, marker] of [
      ['/agenda', 'Nuevo bloque', 'Duración'],
      ['/calendario', 'Nuevo evento', 'Día del mes'],
      ['/horario', 'Nueva clase', 'Aula (opcional)'],
      ['/materias', 'Nueva materia', 'Próxima clase (opcional)'],
      ['/proyectos', 'Editar «Ensayo de Historia»', 'Entrega (opcional)'],
      ['/roadmaps', 'Nuevo roadmap', 'Añadir roadmap'],
      ['/cuadernos', 'Nuevo cuaderno', 'Icono'],
      ['/cuadernos/n1', 'Decorar', 'Icono'],
      ['/cuadernos/n1', 'Lenguaje de la cajita de código «derivada.py»: python', 'Lenguaje'],
      ['/cuadernos/n1', 'Color de la cajita «Regla de la cadena»', 'Color de la cajita'],
      ['/contenido', 'Editar «Probé 100 apps»', 'Etapa'],
      ['/ideas', 'Editar «App de apuntes»', 'Categoría'],
      ['/finanzas', 'Nuevo movimiento', 'Monto'],
      ['/finanzas', 'Cambiar el presupuesto', 'Cuánto quieres gastar al mes'],
      ['/metas', 'Editar «Publicar 8 videos»', 'Fecha límite (opcional)'],
      ['/mascotas', 'Editar a Luna', 'Especie'],
      ['/mascotas', 'Editar «Darle de comer» de Luna', 'Qué hay que hacer'],
      ['/ejercicio', 'Registrar entreno', 'Minutos'],
      ['/sueno', 'Registrar noche', 'Te acostaste'],
      ['/rutina', 'Nueva rutina', 'Qué haces'],
      ['/rutina', 'Editar Desayuno de las 07:30', 'Qué comiste (opcional)'],
    ] as const) {
      await act(async () => router.push(path));
      fireEvent.press(await screen.findByRole('button', { name: button }));
      expect(await screen.findAllByText(marker)).not.toHaveLength(0);
      expect({ path: `${path} (hoja)`, problems: problems() }).toEqual({ path: `${path} (hoja)`, problems: [] });
      // La confirmación de borrar también se puede leer.
      const del = screen.queryByRole('button', { name: 'Borrar' });
      if (del) {
        fireEvent.press(del);
        expect(await screen.findByRole('button', { name: 'Borrar definitivamente' })).toBeOnTheScreen();
        expect({ path: `${path} (borrar)`, problems: problems() }).toEqual({ path: `${path} (borrar)`, problems: [] });
      }
      // El velo de la hoja la cierra (queda fuera del foco del lector mientras está abierta).
      fireEvent.press(screen.UNSAFE_getAllByProps({ accessibilityLabel: 'Cerrar' }).at(-1)!);
    }
  });
});

import type { Dashboard, Profile } from '@dyc/api-client';
import { PILLAR_IDS } from '@dyc/core';
import { vi } from 'vitest';

export type Handler = (body: unknown, url: URL) => [number, unknown] | unknown;

/** fetch falso: responde según "MÉTODO /ruta" y guarda cada llamada. */
export function fakeFetch(routes: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown; auth: string | null }> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    calls.push({ method, path: url.pathname, body, auth: headers.get('Authorization') });
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(' ');
      return m === method && new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+')}$`).test(url.pathname);
    });
    if (!key) return new Response(JSON.stringify({ error: `Sin ruta falsa para ${method} ${url.pathname}` }), { status: 404 });
    const out = await routes[key](body, url);
    const [status, data] = Array.isArray(out) && typeof out[0] === 'number' ? (out as [number, unknown]) : [200, out];
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

export const USER = { id: 'u1', email: 'ana@example.com', name: 'Ana Pérez', gender: 'mujer' as const, showCycle: false };

export const profile = (over: Partial<Profile> = {}): Profile => ({
  focusPillars: ['descanso'],
  intention: null,
  energyLevel: 3,
  activityLevel: 'ligera',
  wakeTime: '07:00',
  bedTime: '23:00',
  timezone: 'UTC',
  baseline: {},
  onboarded: true,
  onboardedAt: '2026-09-20T10:00:00.000Z',
  ...over,
});

export const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  period: 'week',
  date: '2026-09-23',
  today: '2026-09-23',
  range: { from: '2026-09-21', to: '2026-09-27' },
  previousRange: { from: '2026-09-14', to: '2026-09-20' },
  overall: { score: 62, previous: 55 },
  pillars: PILLAR_IDS.map((id) => ({ id, score: id === 'proposito' ? null : 60, previous: 50, delta: id === 'proposito' ? null : 10, daysWithData: 2 })),
  series: [],
  habits: { scheduled: 4, done: 2 },
  checkIns: { count: 2, streak: 2 },
  todayStatus: { checkIn: null, habits: [{ id: 'h1', title: 'Caminar 10 minutos', pillar: 'movimiento', done: false }] },
  challenges: [],
  recommendations: [
    {
      key: 'sleep-short',
      kind: 'insight',
      pillar: 'descanso',
      title: 'Adelanta tu hora de dormir',
      body: 'Prueba acostarte 20 minutos antes.',
      reason: 'Dormiste 6 h de media esta semana.',
      priority: 1,
    },
  ],
  onboarded: true,
  ...over,
});

/** Documento de la app anterior con algo de cada herramienta y claves que la app nueva no conoce. */
export const legacyDoc = (): Record<string, unknown> => ({
  blocks: [
    { id: 'b1', label: 'Estudiar cálculo', sub: 'Capítulo 3', start: 9, dur: 1.5, kind: 'study' },
    { id: 'b2', label: 'Correr', sub: '', start: 18, dur: 1, kind: 'ex' },
  ],
  tasks: [
    { id: 't1', title: 'Entregar ensayo', pri: 'alta', time: null, rem: false, done: false, tags: '' },
    { id: 't2', title: 'Comprar libreta', pri: 'baja', time: null, rem: false, done: true, tags: '' },
  ],
  todos: [
    { id: 'td1', title: 'Pagar la luz', done: false },
    { id: 'td2', title: 'Organizar mudanza', done: false },
    { id: 'td3', title: 'Llamar al banco', done: true },
  ],
  subtasks: [{ id: 's1', todoId: 'td2', title: 'Pedir cajas', done: true }],
  reminders: [{ id: 'r1', day: 14, title: 'Dentista', when: '14:00', color: '#4F7CFF', icon: 'doc', on: true }],
  classes: [{ id: 'c1', day: 1, start: '08:00', end: '09:30', title: 'Cálculo', room: 'A-201', color: '#4F7CFF', subject: '' }],
  focus: [{ id: 'f1', mode: 'focus', seconds: 1500, dateKey: '2026-09-20' }],
  subjects: [
    {
      id: 'mat1',
      name: 'Física',
      color: '#22B8CF',
      room: 'B-3',
      teacher: 'Prof. Ruiz',
      nextClass: 'Lunes 8:00',
      topics: [
        { id: 'tp1', name: 'Ondas', done: true },
        { id: 'xa1b2c3', name: 'Óptica', done: false },
      ],
    },
  ],
  projects: [
    {
      id: 'p1',
      title: 'Maqueta del puente',
      subject: 'Física',
      deadline: '20 SEP',
      status: 'curso',
      color: '#22B8CF',
      milestones: [
        { id: 'm1', name: 'Boceto', date: '', done: true },
        { id: 'm2', name: 'Estructura', date: '', done: false },
      ],
    },
    { id: 'id_p2', title: 'Ensayo de Historia', subject: '', deadline: '', status: 'entregado', color: '#0FA968', milestones: [] },
  ],
  roadmaps: [
    {
      id: 'rm1',
      name: 'Ingeniería',
      color: '#8B5CF6',
      steps: [
        { id: 'st1', name: 'Cálculo I', done: true },
        { id: 'st2', name: 'Cálculo II', done: false },
        { id: 'st3', name: 'Ecuaciones', done: false },
      ],
    },
  ],
  notebooks: [
    { id: 'nb1', title: 'Apuntes de cálculo', category: 'Universidad', subject: 'Cálculo', topic: 'Derivadas', color: '#4F7CFF', emoji: '🧮' },
    { id: 'nb2', title: 'Recetas', category: 'General', subject: '', topic: '', color: '#0FA968', emoji: '📗' },
  ],
  noteBoxes: [
    { id: 'bx1', notebookId: 'nb1', title: 'Regla de la cadena', text: "f(g(x))' = f'(g(x))·g'(x)", color: '#FFF7D6', kind: 'text', lang: '' },
    { id: 'bx2', notebookId: 'nb1', title: 'derivada.py', text: 'def d(f, x, h=1e-6):\n    return (f(x + h) - f(x)) / h', color: '#1e1e2e', kind: 'code', lang: 'python' },
  ],
  content: [
    { id: 'ct1', title: 'Probé 100 apps de IA', stage: 'guion', platform: 'youtube', notes: '', script: 'Gancho: ¿cuál vale la pena?', due: '12 sep' },
    { id: 'ct2', title: 'Mi escritorio', stage: 'publicado', platform: 'tiktok', notes: '', script: '', due: '' },
  ],
  ideas: [
    { id: 'i1', title: 'App de hábitos', body: 'Para estudiantes', category: 'app', tags: 'saas, urgente' },
    { id: 'i2', title: 'Landing para portfolio', body: '', category: 'web', tags: '' },
  ],
  // Tanda 3. Los movimientos son de este mes (UTC); el último es un dato antiguo raro, de otro mes.
  transactions: [
    { id: 'x1', date: new Date().toISOString().slice(0, 10), amount: 1200, type: 'income', category: 'Sueldo', note: 'Septiembre' },
    { id: 'x2', date: new Date().toISOString().slice(0, 10), amount: 45.5, type: 'expense', category: 'Comida', note: 'Mercado' },
    { id: 'x3', date: '2020-01-05', type: 'gasto', amount: 10 },
  ],
  goals: [
    { id: 'g1', title: 'Publicar 8 videos', target: 8, current: 7, unit: 'videos', deadline: '', category: 'creador', done: false },
    { id: 'g2', title: 'Leer 12 libros', target: 12, current: 12, unit: 'libros', deadline: '', category: 'estudio', done: true },
  ],
  pets: [{ id: 'pet1', name: 'Luna', species: 'cat', note: '3 años' }],
  petCares: [{ id: 'pc1', petId: 'pet1', kind: 'comida', title: 'Darle de comer', time: '08:00', days: '1234567', sound: true, enabled: true, lastDone: '' }],
  period: [],
  cycle: { cycleLength: 28, periodLength: 5 },
  workouts: [{ id: 'w1', date: '2026-09-20', plan: 'Core express', minutes: 15 }],
  sleep: [{ id: 'sl1', date: '2026-09-20', bedtime: '23:30', waketime: '07:15', quality: 4, note: '' }],
  journal: [{ id: 'j1', date: '2026-09-19', mood: '🙂', gratitude: 'Mi familia', note: 'Buen día' }],
  routines: [{ id: 'rt1', title: 'Tomar vitaminas', time: '08:30', days: '1234567', icon: 'bell', sound: true, enabled: true }],
  meals: [],
  dayLog: { dateKey: '2020-01-01', water: 5, waterGoal: 8 },
  claveFutura: true,
});

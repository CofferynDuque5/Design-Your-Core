import type { CheckIn } from '@dyc/api-client';
import { addDays, isoWeekday, isScheduled, legacyItemSchemas, noteExcerpt, noteTag, utcDayKey, type Day, type LegacyKey, type PillarId } from '@dyc/core';
import { DB_VERSION, type DemoAccount, type DemoChallenge, type DemoDb, type DemoHabit } from './db';

/**
 * Cuenta de ejemplo de la versión de prueba: Lucía Romero, con tres semanas
 * de check-ins y hábitos, dos retos en curso y algo en cada herramienta de la
 * app anterior. Todas las fechas son relativas a hoy.
 */

export const SAMPLE_ID = 'demo-lucia';
export const SAMPLE_EMAIL = 'lucia@ejemplo.com';
export const SAMPLE_TOKEN = 'demo-token-lucia';

/** Imagen de la nota «Ondas mecánicas» (una onda senoidal pequeña, PNG). */
const ONDA_PNG =
  'data:image/png;base64,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';

/** 0 ≤ n < 1, siempre el mismo para la misma semilla (los datos no cambian al recargar). */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const iso = (d: Day, time = '09:00') => new Date(`${d}T${time}:00.000Z`).toISOString();

interface SeedOptions {
  /** Hoy en la zona de la persona (check-ins, hábitos y retos). */
  today: Day;
  /** Hoy en UTC (las herramientas de la app anterior guardan así la fecha). */
  utcToday?: Day;
  timezone: string;
  now?: Date;
}

function checkInFor(date: Day, i: number, now: string): CheckIn {
  // i = días atrás. Una leve mejora con las semanas y algo de ruido para que la gráfica se vea real.
  const trend = (21 - i) / 21;
  const r = (k: number) => noise(i * 7 + k);
  const scale = (base: number, k: number) => clamp(Math.round(base + trend + (r(k) - 0.5) * 2), 1, 5);
  const weekend = isoWeekday(date) >= 6;
  const sleepHours = Math.round((5.5 + trend * 0.9 + r(4) * 1.8 + (weekend ? 0.6 : 0)) * 2) / 2;
  return {
    date,
    mood: scale(3, 1),
    // Con más horas de sueño, más energía: así sale la recomendación «Dormir 7 horas se nota».
    energy: clamp(Math.round(sleepHours - 3.8 + (r(2) - 0.5)), 1, 5),
    stress: clamp(Math.round(3.4 - trend * 1.2 + (r(3) - 0.5) * 2), 1, 5),
    sleepHours,
    sleepQuality: scale(2.9, 5),
    activeMinutes: Math.round((15 + trend * 20 + r(6) * 25) / 5) * 5,
    nutrition: scale(3.2, 7),
    water: clamp(Math.round(4 + trend * 3 + r(8) * 2), 0, 12),
    connection: scale(3.4, 9),
    purpose: scale(3, 10),
    note: i === 1 ? 'Buen día en la biblioteca. Terminé los ejercicios de integrales.' : i === 3 ? 'Dormí poco, me costó concentrarme.' : i === 8 ? 'Clase de yoga con Marta: salí nueva.' : null,
    gratitude: i === 1 ? 'El café con Marta antes de clase.' : i === 5 ? 'La llamada con la abuela.' : null,
    updatedAt: now,
  };
}

function sampleHabits(today: Day, now: string): DemoHabit[] {
  const start = addDays(today, -21);
  const list: Array<[string, PillarId, string, number]> = [
    ['Caminar 20 minutos', 'movimiento', '1234567', 0.72],
    ['Pantallas fuera antes de dormir', 'descanso', '1234567', 0.55],
    ['Un vaso de agua al despertar', 'alimentacion', '1234567', 0.85],
    ['Un bloque de estudio sin móvil', 'enfoque', '12345', 0.7],
    ['Llamar a alguien querido', 'relaciones', '67', 0.8],
  ];
  const habits: DemoHabit[] = list.map(([title, pillar, days, rate], j) => {
    const logs: Record<Day, boolean> = {};
    for (let i = 21; i >= 1; i--) {
      const d = addDays(today, -i);
      // Cada vez un poco más constante: la racha se nota en las últimas semanas.
      if (isScheduled(days, d) && noise(i * 13 + j) < rate + (21 - i) / 90) logs[d] = true;
    }
    return { id: `h${j + 1}`, title, pillar, days, startsOn: start, archivedAt: null, createdAt: iso(start, `0${j}:00`), logs };
  });
  // Hoy ya marcó dos.
  habits[0].logs[today] = true;
  habits[2].logs[today] = true;
  habits.push({
    id: 'h6',
    title: 'Escribir tres cosas buenas del día',
    pillar: 'proposito',
    days: '1234567',
    startsOn: start,
    archivedAt: iso(addDays(today, -8)),
    createdAt: iso(start, '06:00'),
    logs: Object.fromEntries([-20, -19, -17, -15, -14, -12, -10].map((n) => [addDays(today, n), true])),
  });
  void now;
  return habits;
}

function sampleChallenges(today: Day): DemoChallenge[] {
  const logs = (from: number, to: number, skip: number[] = []) => {
    const out: Record<Day, boolean> = {};
    for (let n = from; n <= to; n++) if (!skip.includes(n)) out[addDays(today, n)] = true;
    return out;
  };
  return [
    { id: 'c1', key: 'atencion-2', pillar: 'enfoque', startedOn: addDays(today, -4), durationDays: 7, status: 'active', endedAt: null, logs: logs(-4, -1) },
    { id: 'c2', key: 'dormir-1', pillar: 'descanso', startedOn: addDays(today, -2), durationDays: 7, status: 'active', endedAt: null, logs: logs(-2, -1) },
    { id: 'c3', key: 'comer-1', pillar: 'alimentacion', startedOn: addDays(today, -16), durationDays: 7, status: 'completed', endedAt: iso(addDays(today, -9)), logs: logs(-16, -10, [-13]) },
    { id: 'c4', key: 'caminar-2', pillar: 'movimiento', startedOn: addDays(today, -20), durationDays: 7, status: 'abandoned', endedAt: iso(addDays(today, -17)), logs: logs(-20, -18) },
  ];
}

const note = (id: string, title: string, subject: string, date: string, tags: string, body: string) => ({
  id,
  title,
  subject,
  date,
  tag: noteTag(subject),
  excerpt: noteExcerpt(body),
  body,
  commit: false,
  tags,
  shareId: null,
});

/** Documento de la app anterior con algo en cada herramienta. */
export function sampleLegacy(today: Day): Record<string, unknown> {
  const day = (n: number) => addDays(today, n);
  const dom = Number(today.slice(8, 10));
  const month = today.slice(0, 7);
  const lists: Partial<Record<LegacyKey, Array<Record<string, unknown>>>> = {
    blocks: [
      { id: 'b1', label: 'Correr por el parque', sub: '5 km suaves', start: 7, dur: 1, kind: 'ex' },
      { id: 'b2', label: 'Desayuno', sub: '', start: 8, dur: 0.5, kind: 'break' },
      { id: 'b3', label: 'Estudiar cálculo', sub: 'Integrales por partes', start: 9, dur: 2, kind: 'study' },
      { id: 'b4', label: 'Clase de física', sub: 'Aula B-12', start: 11, dur: 1.5, kind: 'class' },
      { id: 'b5', label: 'Comida', sub: '', start: 13, dur: 1, kind: 'break' },
      { id: 'b6', label: 'Proyecto de la app', sub: 'Pantalla de acceso', start: 15, dur: 2, kind: 'project' },
      { id: 'b7', label: 'Leer «Cien años de soledad»', sub: 'Capítulos 4 y 5', start: 20, dur: 1, kind: 'read' },
    ],
    tasks: [
      { id: 't1', title: 'Entregar el informe de laboratorio', pri: 'alta', time: '10:00', rem: true, done: false, tags: '' },
      { id: 't2', title: 'Pagar la matrícula', pri: 'alta', time: null, rem: false, done: false, tags: '' },
      { id: 't3', title: 'Responder los correos del grupo', pri: 'media', time: null, rem: false, done: true, tags: '' },
      { id: 't4', title: 'Comprar material de dibujo', pri: 'media', time: '18:30', rem: true, done: false, tags: '' },
      { id: 't5', title: 'Ordenar las fotos del viaje', pri: 'baja', time: null, rem: false, done: false, tags: '' },
    ],
    todos: [
      { id: 'd1', title: 'Preparar la presentación de historia', done: false },
      { id: 'd2', title: 'Renovar el pasaporte', done: false },
      { id: 'd3', title: 'Arreglar el freno de la bici', done: false },
      { id: 'd4', title: 'Llamar a la abuela', done: true },
    ],
    subtasks: [
      { id: 's1', todoId: 'd1', title: 'Buscar fuentes en la biblioteca', done: true },
      { id: 's2', todoId: 'd1', title: 'Hacer las diapositivas', done: false },
      { id: 's3', todoId: 'd1', title: 'Ensayar en voz alta', done: false },
      { id: 's4', todoId: 'd3', title: 'Comprar pastillas nuevas', done: false },
    ],
    reminders: [
      { id: 'r1', day: dom, title: 'Cumpleaños de Marta', when: '20:00 · cena en casa', color: '#EC6A9C', icon: 'doc', on: true },
      { id: 'r2', day: dom, title: 'Regar las plantas', when: '', color: '#0FA968', icon: 'doc', on: true },
      { id: 'r3', day: 1, title: 'Pagar el alquiler', when: 'Antes de las 12:00', color: '#E8912A', icon: 'doc', on: true },
      { id: 'r4', day: 5, title: 'Revisión dental', when: '10:30', color: '#4F7CFF', icon: 'doc', on: true },
      { id: 'r5', day: 15, title: 'Cuota del gimnasio', when: '', color: '#8B5CF6', icon: 'doc', on: true },
      { id: 'r6', day: 22, title: 'Reunión de vecinos', when: '19:00', color: '#E5484D', icon: 'doc', on: false },
    ],
    classes: [
      { id: 'cl1', day: 1, start: '08:00', end: '09:30', title: 'Cálculo', room: 'A-201', color: '#4F7CFF', subject: 'm1' },
      { id: 'cl2', day: 1, start: '10:00', end: '11:30', title: 'Física', room: 'B-12', color: '#0FA968', subject: 'm2' },
      { id: 'cl3', day: 2, start: '09:00', end: '10:30', title: 'Programación', room: 'Laboratorio 3', color: '#8B5CF6', subject: 'm3' },
      { id: 'cl4', day: 3, start: '08:00', end: '09:30', title: 'Cálculo', room: 'A-201', color: '#4F7CFF', subject: 'm1' },
      { id: 'cl5', day: 3, start: '12:00', end: '13:30', title: 'Historia del arte', room: 'Aula magna', color: '#EC6A9C', subject: '' },
      { id: 'cl6', day: 4, start: '10:00', end: '11:30', title: 'Física', room: 'B-12', color: '#0FA968', subject: 'm2' },
      { id: 'cl7', day: 5, start: '09:00', end: '11:00', title: 'Programación', room: 'Laboratorio 3', color: '#8B5CF6', subject: 'm3' },
      { id: 'cl8', day: 6, start: '17:00', end: '18:30', title: 'Taller de inglés', room: 'Centro cívico', color: '#E8912A', subject: '' },
    ],
    focus: [
      { id: 'f1', mode: 'focus', seconds: 1500, dateKey: today },
      { id: 'f2', mode: 'short', seconds: 300, dateKey: today },
      { id: 'f3', mode: 'focus', seconds: 1500, dateKey: today },
      { id: 'f4', mode: 'focus', seconds: 1500, dateKey: day(-1) },
      { id: 'f5', mode: 'focus', seconds: 1320, dateKey: day(-1) },
      { id: 'f6', mode: 'long', seconds: 900, dateKey: day(-1) },
      { id: 'f7', mode: 'focus', seconds: 1500, dateKey: day(-3) },
      { id: 'f8', mode: 'focus', seconds: 1500, dateKey: day(-4) },
    ],
    subjects: [
      { id: 'm1', name: 'Cálculo', teacher: 'Dra. Morales', room: 'A-201', color: '#4F7CFF', nextClass: 'Lunes 8:00', topics: [{ id: 'tp1', name: 'Límites', done: true }, { id: 'tp2', name: 'Derivadas', done: true }, { id: 'tp3', name: 'Integrales', done: false }] },
      { id: 'm2', name: 'Física', teacher: 'Sr. Ibáñez', room: 'B-12', color: '#0FA968', nextClass: 'Lunes 10:00', topics: [{ id: 'tp4', name: 'Cinemática', done: true }, { id: 'tp5', name: 'Ondas', done: false }] },
      { id: 'm3', name: 'Programación', teacher: 'Sra. Vidal', room: 'Laboratorio 3', color: '#8B5CF6', nextClass: 'Martes 9:00', topics: [{ id: 'tp6', name: 'Funciones', done: true }, { id: 'tp7', name: 'Recursión', done: false }] },
    ],
    projects: [
      { id: 'pr1', title: 'App de apuntes', subject: 'Programación', deadline: '15 oct', status: 'curso', color: '#8B5CF6', milestones: [{ id: 'ms1', name: 'Bocetos', date: '', done: true }, { id: 'ms2', name: 'Pantalla de acceso', date: '', done: false }, { id: 'ms3', name: 'Pruebas con compañeros', date: '', done: false }] },
      { id: 'pr2', title: 'Maqueta del puente', subject: 'Física', deadline: '2 oct', status: 'revision', color: '#0FA968', milestones: [{ id: 'ms4', name: 'Cálculos', date: '', done: true }, { id: 'ms5', name: 'Montaje', date: '', done: true }] },
      { id: 'pr3', title: 'Ensayo de historia del arte', subject: '', deadline: '', status: 'entregado', color: '#EC6A9C', milestones: [] },
    ],
    roadmaps: [
      { id: 'rm1', name: 'Ingeniería informática', color: '#4F7CFF', steps: [{ id: 'st1', name: 'Cálculo I', done: true }, { id: 'st2', name: 'Programación I', done: true }, { id: 'st3', name: 'Cálculo II', done: false }, { id: 'st4', name: 'Estructuras de datos', done: false }, { id: 'st5', name: 'Bases de datos', done: false }] },
      { id: 'rm2', name: 'Inglés B2', color: '#E8912A', steps: [{ id: 'st6', name: 'Gramática', done: true }, { id: 'st7', name: 'Listening', done: false }, { id: 'st8', name: 'Examen oficial', done: false }] },
    ],
    notebooks: [
      { id: 'nb1', title: 'Apuntes de cálculo', category: 'Universidad', subject: 'Cálculo', topic: 'Integrales', color: '#4F7CFF', emoji: '🧮' },
      { id: 'nb2', title: 'Física general', category: 'Universidad', subject: 'Física', topic: 'Ondas', color: '#0FA968', emoji: '🔬' },
      { id: 'nb3', title: 'Recetas', category: 'Personal', subject: '', topic: 'Cenas rápidas', color: '#E8912A', emoji: '📗' },
    ],
    noteBoxes: [
      { id: 'bx1', notebookId: 'nb1', title: 'Regla de la cadena', text: 'La derivada de f(g(x)) es f′(g(x))·g′(x).', color: '#FFE8D6', kind: 'text', lang: '' },
      { id: 'bx2', notebookId: 'nb1', title: 'integral.py', text: 'from sympy import integrate, symbols\n\nx = symbols("x")\nprint(integrate(x * 2, x))', color: '#1e1e2e', kind: 'code', lang: 'python' },
      { id: 'bx3', notebookId: 'nb2', title: 'Velocidad de una onda', text: 'v = λ · f\nLa velocidad depende del medio, no de la fuente.', color: '#DDF3E4', kind: 'text', lang: '' },
      { id: 'bx4', notebookId: 'nb3', title: 'Tortilla en 15 minutos', text: '4 huevos, 2 patatas pequeñas en láminas finas, cebolla al gusto. Sartén tapada a fuego medio.', color: '#FFF7D6', kind: 'text', lang: '' },
    ],
    content: [
      { id: 'ct1', title: 'Probé 5 métodos de estudio', stage: 'guion', platform: 'youtube', notes: 'Pomodoro, Feynman, repaso espaciado, mapas mentales y enseñar a otra persona.', script: 'Gancho: ¿cuál funciona de verdad?', due: '2 oct' },
      { id: 'ct2', title: 'Mi escritorio de estudio', stage: 'publicado', platform: 'tiktok', notes: '', script: '', due: '' },
      { id: 'ct3', title: 'Rutina de mañana', stage: 'idea', platform: 'instagram', notes: '', script: '', due: '' },
      { id: 'ct4', title: 'Cómo organizo mis apuntes', stage: 'grabar', platform: 'youtube', notes: '', script: '', due: '5 oct' },
      { id: 'ct5', title: 'Un día de exámenes', stage: 'editar', platform: 'tiktok', notes: '', script: '', due: '' },
    ],
    ideas: [
      { id: 'i1', title: 'App para compartir apuntes', body: 'Entre compañeros de clase, con búsqueda por tema.', category: 'app', tags: 'estudio, proyecto' },
      { id: 'i2', title: 'Blog de recetas rápidas', body: 'Cenas en 15 minutos para estudiantes.', category: 'web', tags: 'cocina' },
      { id: 'i3', title: 'Club de lectura en la biblioteca', body: 'Un libro al mes, los jueves.', category: 'otro', tags: 'lectura' },
      { id: 'i4', title: 'Carteles para la feria de ciencias', body: '', category: 'marketing', tags: '' },
    ],
    transactions: [
      { id: 'x1', date: day(-1), amount: 12.5, type: 'expense', category: 'Comida', note: 'Menú del día' },
      { id: 'x2', date: day(-2), amount: 46.8, type: 'expense', category: 'Comida', note: 'Supermercado' },
      { id: 'x3', date: day(-3), amount: 18, type: 'expense', category: 'Ocio', note: 'Cine con Marta' },
      { id: 'x5', date: day(-6), amount: 120, type: 'income', category: 'Freelance', note: 'Logo para una cafetería' },
      { id: 'x6', date: day(-7), amount: 32, type: 'expense', category: 'Transporte', note: 'Abono' },
      { id: 'x7', date: day(-9), amount: 24.9, type: 'expense', category: 'Estudio', note: 'Libro de física' },
      { id: 'x8', date: `${month}-02`, amount: 350, type: 'expense', category: 'Hogar', note: 'Alquiler (mi parte)' },
      { id: 'x4', date: `${month}-01`, amount: 850, type: 'income', category: 'Sueldo', note: 'Beca' },
    ],
    goals: [
      { id: 'g1', title: 'Leer 12 libros', target: 12, current: 8, unit: 'libros', deadline: day(90), category: 'personal', done: false },
      { id: 'g2', title: 'Ahorrar para el viaje a Lisboa', target: 600, current: 420, unit: '€', deadline: day(45), category: 'dinero', done: false },
      { id: 'g3', title: 'Correr 10 km sin parar', target: 10, current: 7, unit: 'km', deadline: day(26), category: 'salud', done: false },
      { id: 'g4', title: 'Aprobar Cálculo', target: 1, current: 0, unit: '', deadline: day(12), category: 'estudio', done: false },
      { id: 'g5', title: 'Publicar 4 videos', target: 4, current: 4, unit: 'videos', deadline: '', category: 'creador', done: true },
    ],
    pets: [
      { id: 'p1', name: 'Canela', species: 'cat', note: '4 años, adoptada' },
      { id: 'p2', name: 'Toby', species: 'dog', note: 'Le da miedo la aspiradora' },
    ],
    petCares: [
      { id: 'pc1', petId: 'p1', kind: 'comida', title: 'Pienso por la mañana', time: '08:00', days: '1234567', sound: true, enabled: true, lastDone: today },
      { id: 'pc2', petId: 'p1', kind: 'agua', title: 'Cambiar el agua', time: '20:00', days: '1234567', sound: true, enabled: true, lastDone: day(-1) },
      { id: 'pc3', petId: 'p1', kind: 'vet', title: 'Vacuna anual', time: '', days: '6', sound: true, enabled: false, lastDone: '' },
      { id: 'pc4', petId: 'p2', kind: 'paseo', title: 'Paseo largo', time: '09:00', days: '67', sound: true, enabled: true, lastDone: '' },
      { id: 'pc5', petId: 'p2', kind: 'comida', title: 'Comida', time: '14:00', days: '1234567', sound: true, enabled: true, lastDone: '' },
    ],
    period: (
      [
        [-30, 'medium', 'Cólicos', '😔'],
        [-29, 'heavy', 'Cólicos, Fatiga', '😣'],
        [-28, 'medium', '', '😐'],
        [-27, 'light', '', '🙂'],
        [-2, 'medium', 'Cólicos, Dolor de cabeza', '😔'],
        [-1, 'heavy', 'Cólicos', '😣'],
        [0, 'medium', 'Fatiga', '😐'],
      ] as const
    ).map(([n, flow, symptoms, mood], i) => ({ id: `pd${i}`, date: day(n), flow, symptoms, mood, note: n === -1 ? 'Ibuprofeno a las 9' : '' })),
    workouts: [
      { id: 'w1', date: today, plan: 'Core express', minutes: 15 },
      { id: 'w2', date: day(-1), plan: 'Carrera suave', minutes: 35 },
      { id: 'w3', date: day(-2), plan: 'Full body', minutes: 30 },
      { id: 'w4', date: day(-4), plan: 'Yoga', minutes: 40 },
      { id: 'w5', date: day(-6), plan: 'Piernas y glúteos', minutes: 25 },
      { id: 'w6', date: day(-9), plan: 'Estiramientos', minutes: 10 },
      { id: 'w7', date: day(-11), plan: 'Carrera suave', minutes: 30 },
    ],
    sleep: (
      [
        [0, '23:40', '07:30', 4],
        [-1, '00:15', '07:10', 3],
        [-2, '23:20', '07:00', 4],
        [-3, '01:30', '07:00', 2],
        [-4, '23:00', '07:15', 5],
        [-5, '00:30', '09:00', 4],
        [-6, '01:00', '09:30', 3],
        [-7, '23:45', '07:20', 4],
        [-8, '23:30', '07:00', 4],
        [-9, '00:10', '06:50', 3],
      ] as const
    ).map(([n, bedtime, waketime, quality], i) => ({ id: `z${i}`, date: day(n), bedtime, waketime, quality, note: n === -3 ? 'Estudiando hasta tarde' : '' })),
    journal: [
      { id: 'j1', date: today, mood: '🙂', gratitude: 'El café con Marta antes de clase', note: 'Mañana tranquila. Terminé los ejercicios de integrales y salí a entrenar un rato.' },
      { id: 'j2', date: day(-1), mood: '😄', gratitude: 'La tarde con mis amigas', note: 'Buen día en la biblioteca.' },
      { id: 'j3', date: day(-2), mood: '🙂', gratitude: '', note: 'Entrega de física hecha a tiempo.' },
      { id: 'j4', date: day(-3), mood: '😴', gratitude: '', note: 'Dormí poco, me costó concentrarme.' },
      { id: 'j5', date: day(-5), mood: '😐', gratitude: 'Llamada con la abuela', note: '' },
    ],
    routines: [
      { id: 'o1', title: 'Vitaminas', time: '08:00', days: '1234567', icon: 'bell', sound: true, enabled: true },
      { id: 'o2', title: 'Meditar 10 minutos', time: '07:30', days: '12345', icon: 'bell', sound: true, enabled: true },
      { id: 'o3', title: 'Repasar el día', time: '21:30', days: '1234567', icon: 'bell', sound: true, enabled: true },
      { id: 'o4', title: 'Llamar a casa', time: '12:00', days: '67', icon: 'bell', sound: true, enabled: false },
    ],
    meals: [
      { id: 'ml1', label: 'Desayuno', time: '08:15', note: 'Tostadas con tomate y café', dateKey: today },
      { id: 'ml2', label: 'Snack', time: '10:30', note: 'Una manzana', dateKey: today },
    ],
    notes: [
      note(
        'n1',
        'Ondas mecánicas',
        'Física',
        '24 sept',
        'examen, repaso',
        [
          '# Ondas mecánicas',
          '',
          'Una onda transporta **energía** sin transportar materia. Necesita un *medio* para propagarse (aire, agua, una cuerda).',
          '',
          '## Magnitudes',
          '- **Periodo** (T): tiempo de una oscilación completa, en segundos.',
          '- **Frecuencia** (f): oscilaciones por segundo, en hercios. $f = 1/T$',
          '- **Longitud de onda** (λ): distancia entre dos crestas.',
          '',
          '```',
          'v = λ · f',
          '```',
          '',
          '![Onda senoidal con su amplitud](coreimg:img_onda01)',
          '',
          '> La velocidad depende del medio, no de la fuente.',
          '',
          '## Para el examen',
          '- [x] Repasar los ejercicios del tema 3',
          '- [ ] Hacer el simulacro del viernes',
          '- [ ] Preguntar la duda del efecto Doppler',
        ].join('\n'),
      ),
      note('n2', 'Leyes de Newton', 'Física', '18 sept', 'examen', '# Leyes de Newton\n\n1. **Inercia**: un cuerpo sigue en reposo o en movimiento uniforme si nada lo cambia.\n2. **Fuerza**: $F = m · a$\n3. **Acción y reacción**.'),
      note('n3', 'Integrales por partes', 'Cálculo', '22 sept', 'examen, fórmulas', '# Integrales por partes\n\n$$\\int u\\,dv = uv - \\int v\\,du$$\n\nElegir **u** con la regla ALPES: arcos, logaritmos, polinomios, exponenciales y senos.'),
      note('n4', 'Ideas para el trabajo final', 'Programación', '25 sept', 'proyecto', 'Una app para **compartir apuntes** entre compañeros:\n\n- Inicio con las materias\n- Búsqueda sin tildes\n- Modo oscuro'),
      note('n5', 'Lista de lecturas', 'General', '10 sept', '', '- *Cien años de soledad*\n- *El túnel*\n- *Rayuela*'),
    ],
    workItems: [
      { id: 'wk1', title: 'Preparar el informe mensual', project: 'p1', status: 'curso', done: false, due: 'Viernes' },
      { id: 'wk2', title: 'Revisar el diseño de la pantalla de acceso', project: 'p2', status: 'curso', done: false, due: 'Hoy' },
      { id: 'wk3', title: 'Responder a la clienta de la tienda', project: 'p3', status: 'todo', done: false, due: '' },
      { id: 'wk4', title: 'Actualizar el presupuesto', project: 'p1', status: 'todo', done: false, due: '30 sept' },
      { id: 'wk5', title: 'Subir las fotos del catálogo', project: 'p3', status: 'todo', done: false, due: '' },
      { id: 'wk6', title: 'Enviar la factura de agosto', project: 'p2', status: 'todo', done: true, due: '' },
    ],
    meditations: [
      { id: 'md1', date: today, minutes: 3, kind: 'respiracion' },
      { id: 'md2', date: day(-1), minutes: 5, kind: 'respiracion' },
      { id: 'md3', date: day(-3), minutes: 1, kind: 'respiracion' },
      { id: 'md4', date: day(-5), minutes: 3, kind: 'respiracion' },
    ],
  };
  // Cada elemento pasa por la misma validación que la API: la muestra es siempre válida.
  const doc: Record<string, unknown> = Object.fromEntries(
    Object.entries(lists).map(([key, items]) => [key, (items ?? []).map((item) => legacyItemSchemas[key as LegacyKey].parse(item))]),
  );
  doc.cycle = { cycleLength: 28, periodLength: 5 };
  doc.dayLog = { dateKey: today, water: 5, waterGoal: 8 };
  doc.budget = { monthly: 700 };
  return doc;
}

/** La cuenta de Lucía. */
export function sampleAccount({ today, utcToday, timezone, now = new Date() }: SeedOptions): DemoAccount {
  const stamp = now.toISOString();
  const checkIns: Record<Day, CheckIn> = {};
  for (let i = 20; i >= 1; i--) {
    // Dos días sin registro hace semanas: la racha actual es de doce días.
    if (i === 13 || i === 17) continue;
    const d = addDays(today, -i);
    checkIns[d] = checkInFor(d, i, iso(d, '21:30'));
  }
  return {
    user: { id: SAMPLE_ID, email: SAMPLE_EMAIL, name: 'Lucía Romero', gender: 'mujer', showCycle: true },
    profile: {
      focusPillars: ['enfoque', 'descanso'],
      intention: 'Terminar el curso con calma y dormir mejor.',
      energyLevel: 3,
      activityLevel: 'ligera',
      wakeTime: '07:15',
      bedTime: '23:30',
      timezone,
      baseline: { movimiento: 3, descanso: 2, alimentacion: 3, enfoque: 2, relaciones: 4, proposito: 3 },
      onboardedAt: iso(addDays(today, -22), '10:00'),
    },
    checkIns,
    habits: sampleHabits(today, stamp),
    challenges: sampleChallenges(today),
    dismissals: {},
    blob: { data: sampleLegacy(utcToday ?? utcDayKey(now)), updatedAt: stamp },
    images: { img_onda01: ONDA_PNG },
    inviteCode: null,
    partner: null,
  };
}

/** Cuenta nueva (registro): sin perfil ni datos, como en la API real. */
export function emptyAccount(id: string, email: string, name: string, gender: 'mujer' | 'hombre' | 'otro'): DemoAccount {
  return {
    user: { id, email, name, gender, showCycle: gender === 'mujer' },
    profile: null,
    checkIns: {},
    habits: [],
    challenges: [],
    dismissals: {},
    blob: { data: {}, updatedAt: new Date().toISOString() },
    images: {},
    inviteCode: null,
    partner: null,
  };
}

export function seedDb(opts: SeedOptions): DemoDb {
  return { version: DB_VERSION, baseDay: opts.today, accounts: [sampleAccount(opts)], tokens: { [SAMPLE_TOKEN]: SAMPLE_ID } };
}

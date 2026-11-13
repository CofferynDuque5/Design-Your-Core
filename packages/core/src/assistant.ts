import { storedAttachment, userContent } from './attachments.js';
import { isDay } from './dates.js';
import {
  GOAL_CATEGORIES,
  IDEA_CATEGORIES,
  legacyItemSchemas,
  legacyList,
  legacyObject,
  monthSummary,
  onWeekday,
  sleepMinutes,
  TASK_PRIORITIES,
  TX_TYPES,
  utcDayKey,
  waterToday,
  WATER_GOAL_DEFAULT,
  workoutStats,
  type CardStatus,
  type LegacyChat,
  type LegacyData,
  type LegacyKey,
  type StoredCard,
  type StoredChatMessage,
  type StoredToolCall,
} from './legacy.js';
import { PILLAR_NAMES, type PillarId } from './pillars.js';

/**
 * Asistente con la clave de Gemini de la persona, compartido por la web y el
 * móvil. Las peticiones van directamente del dispositivo a Google (API
 * compatible con OpenAI), sin pasar por nuestro servidor. Nada se escribe en
 * los datos sin que la persona pulse «Hacer» en la acción propuesta.
 *
 * Aquí no se guarda nada: cada app decide dónde vive la clave.
 */

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
export const ASSISTANT_MODELS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-flash-lite-latest', 'gemini-pro-latest'] as const;
export type AssistantModel = (typeof ASSISTANT_MODELS)[number];
export const DEFAULT_MODEL: AssistantModel = 'gemini-flash-latest';
/** Si el modelo elegido está saturado (429) o falla (5xx), se reintenta una vez con este. */
export const FALLBACK_MODEL: AssistantModel = 'gemini-flash-lite-latest';
/** Razonamiento mínimo: para un asistente de agenda importa más la rapidez. */
export const REASONING_EFFORT = 'low';
/** Si Gemini no responde en este tiempo se corta y se prueba con el modelo de reserva (en vez de esperar sin fin). */
export const REQUEST_TIMEOUT_MS = 30_000;


export interface AssistantSettings {
  apiKey: string;
  model: AssistantModel;
  /** Ya leyó qué datos se envían. */
  seenPrivacy: boolean;
}

/** Nota que acompaña a cada modelo en el selector. */
export const ASSISTANT_MODEL_NOTE: Record<AssistantModel, string> = {
  'gemini-flash-latest': 'recomendado',
  'gemini-3.6-flash': 'rápido',
  'gemini-flash-lite-latest': 'el más rápido',
  'gemini-pro-latest': 'más lento, piensa más',
};

/** Nombre sencillo de cada modelo para el selector (el nombre técnico no le dice nada a casi nadie). */
export const ASSISTANT_MODEL_LABEL: Record<AssistantModel, string> = {
  'gemini-flash-latest': 'Equilibrado (recomendado)',
  'gemini-3.6-flash': 'Rápido',
  'gemini-flash-lite-latest': 'Muy rápido',
  'gemini-pro-latest': 'Profundo (más lento, piensa más)',
};

/** Pasos para conseguir la clave, para quien nunca ha usado Google AI Studio. */
export const GEMINI_KEY_STEPS = [
  'Abre Google AI Studio (aistudio.google.com/apikey) e inicia sesión con tu cuenta de Google.',
  'Pulsa «Create API key» (Crear clave). Si te pide un proyecto, elige el que te ofrece.',
  'Copia la clave que aparece: es un texto largo que empieza por «AIza».',
  'Pégala aquí abajo y pulsa «Guardar». Es gratis para un uso normal.',
] as const;

export const isAssistantModel = (m: unknown): m is AssistantModel => typeof m === 'string' && (ASSISTANT_MODELS as readonly string[]).includes(m);

/** Ajustes guardados (JSON) → ajustes válidos; lo que no sirve vuelve al valor por defecto. */
export function parseAssistantSettings(raw: unknown): AssistantSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AssistantSettings>;
  return {
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    model: isAssistantModel(r.model) ? r.model : DEFAULT_MODEL,
    seenPrivacy: r.seenPrivacy === true,
  };
}

/** Solo los últimos 4 caracteres, para reconocer la clave sin mostrarla. */
export const maskKey = (k: string) => (k.length > 4 ? `••••${k.slice(-4)}` : '••••');

// ---------- Herramientas ----------

type Json = Record<string, unknown>;
const fn = (name: ToolName, description: string, properties: Json, required: string[]) => ({
  type: 'function' as const,
  function: { name, description, parameters: { type: 'object', properties, required } },
});

export const TOOL_NAMES = ['add_todo', 'add_task', 'add_idea', 'add_goal', 'add_transaction', 'log_water', 'log_workout', 'log_sleep', 'add_journal', 'add_routine'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Mismas herramientas y parámetros que el Asistente de la app anterior (las de escritura que se conservan). */
export const TOOLS = [
  fn('add_todo', 'Añade un pendiente simple (sin hora).', { title: { type: 'string' } }, ['title']),
  fn('add_task', 'Añade una tarea a la agenda con prioridad y hora opcional.', { title: { type: 'string' }, pri: { type: 'string', enum: [...TASK_PRIORITIES] }, time: { type: 'string', description: 'HH:MM opcional' } }, ['title']),
  fn('add_idea', 'Guarda una idea (de app, web, marketing u otro) en la sección Ideas.', { title: { type: 'string' }, body: { type: 'string' }, category: { type: 'string', enum: [...IDEA_CATEGORIES] } }, ['title']),
  fn(
    'add_goal',
    'Crea una meta con una cantidad a alcanzar.',
    { title: { type: 'string' }, target: { type: 'number' }, unit: { type: 'string' }, category: { type: 'string', enum: [...GOAL_CATEGORIES] }, deadline: { type: 'string', description: 'AAAA-MM-DD opcional' } },
    ['title', 'target'],
  ),
  fn('add_transaction', 'Registra un movimiento de dinero de hoy (ingreso o gasto) en Finanzas.', { amount: { type: 'number' }, type: { type: 'string', enum: ['income', 'expense'] }, category: { type: 'string' }, note: { type: 'string' } }, ['amount', 'type']),
  fn('log_water', 'Suma vasos de agua bebidos hoy.', { glasses: { type: 'number' } }, ['glasses']),
  fn('log_workout', 'Registra un entrenamiento hecho hoy en Ejercicio.', { plan: { type: 'string', description: 'nombre del plan o rutina' }, minutes: { type: 'number', description: 'minutos que duró' } }, ['plan', 'minutes']),
  fn('log_sleep', 'Registra el sueño de la última noche.', { bedtime: { type: 'string', description: 'HH:MM en que se acostó' }, waketime: { type: 'string', description: 'HH:MM en que despertó' }, quality: { type: 'number', description: '1 a 5' } }, ['bedtime', 'waketime']),
  fn('add_journal', 'Escribe en el Diario de hoy (ánimo, gratitud o nota).', { mood: { type: 'string', description: 'emoji de ánimo, opcional' }, gratitude: { type: 'string' }, note: { type: 'string' } }, []),
  fn('add_routine', 'Agenda un recordatorio con hora en la rutina diaria.', { title: { type: 'string' }, time: { type: 'string', description: 'HH:MM 24 h' }, days: { type: 'string', description: 'dígitos 1-7 (1 = lunes); por defecto 1234567' } }, ['title', 'time']),
];

export type ToolCall = StoredToolCall;

/** Qué se escribirá si la persona pulsa «Hacer». */
export type Plan =
  | { kind: 'add'; key: LegacyKey; item: Json & { id: string } }
  | { kind: 'update'; key: LegacyKey; id: string; patch: Json }
  /** El total se calcula al pulsar «Hacer», con lo que haya entonces. */
  | { kind: 'water'; glasses: number; today: string }
  /** Varios elementos de una vez (por ejemplo, un pendiente y sus subtareas), en orden. */
  | { kind: 'batch'; ops: Array<{ kind: 'add'; key: LegacyKey; item: Json & { id: string } } | { kind: 'update'; key: LegacyKey; id: string; patch: Json }> };

export interface Proposal {
  callId: string;
  tool: string;
  /** «Añadir pendiente», «Registrar agua»… */
  title: string;
  /** Sección donde se guarda. */
  where: string;
  fields: Array<{ label: string; value: string }>;
  /** null si los datos no sirven (entonces `error`). */
  plan: Plan | null;
  error?: string;
  /** Lo que se dice al modelo cuando se hace. */
  done: string;
  /** Por qué se sugiere (sugerencias de las secciones). */
  reason?: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
/** «8:05» → «08:05»; lo que no es una hora, vacío. */
export const normTime = (v: unknown): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(v));
  if (!m) return '';
  const t = `${m[1].padStart(2, '0')}:${m[2]}`;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '';
};
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(str(v) as T) ? (str(v) as T) : fallback);
const numberOr = (v: unknown, fallback: number) => {
  if (typeof v !== 'number' && !str(v)) return fallback;
  const n = typeof v === 'number' ? v : Number(str(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};
const PRI_LABEL: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const daysText = (d: string) => (d === '1234567' ? 'Todos los días' : [...d].map((n) => DAY_NAMES[Number(n) - 1]).join(', '));

/** Comprueba el elemento con el mismo esquema que el servidor. */
function checked(key: LegacyKey, item: Json & { id: string }): { item: Json & { id: string } } | { error: string } {
  const r = legacyItemSchemas[key].safeParse(item);
  return r.success ? { item: r.data as Json & { id: string } } : { error: r.error.issues[0]?.message ?? 'Datos no válidos' };
}

/**
 * Convierte una llamada del modelo en una acción propuesta. No escribe nada:
 * solo prepara el cambio para que la persona lo confirme.
 */
export function planTool(call: ToolCall, data: LegacyData | undefined, opts: { newId: () => string; today?: string }): Proposal {
  const today = opts.today ?? utcDayKey();
  let args: Json = {};
  try {
    const parsed = JSON.parse(call.function.arguments || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Json;
  } catch {
    return { callId: call.id, tool: call.function.name, title: 'Acción no válida', where: '', fields: [], plan: null, error: 'Los datos de la acción no se pudieron leer.', done: '' };
  }
  const base = { callId: call.id, tool: call.function.name };
  const fail = (title: string, where: string, error: string): Proposal => ({ ...base, title, where, fields: [], plan: null, error, done: '' });
  const add = (title: string, where: string, key: LegacyKey, item: Json & { id: string }, fields: Proposal['fields'], done: string): Proposal => {
    const c = checked(key, item);
    if ('error' in c) return { ...base, title, where, fields, plan: null, error: c.error, done: '' };
    return { ...base, title, where, fields, plan: { kind: 'add', key, item: c.item }, done };
  };
  const id = opts.newId();

  switch (call.function.name as ToolName) {
    case 'add_todo': {
      const title = str(args.title);
      if (!title) return fail('Añadir pendiente', 'Pendientes', 'Falta el título del pendiente.');
      return add('Añadir pendiente', 'Pendientes', 'todos', { id, title, done: false }, [{ label: 'Pendiente', value: title }], `Pendiente añadido: «${title}».`);
    }
    case 'add_task': {
      const title = str(args.title);
      if (!title) return fail('Añadir tarea', 'Agenda', 'Falta el título de la tarea.');
      const pri = pick(args.pri, TASK_PRIORITIES, 'media');
      const time = normTime(args.time) || null;
      return add(
        'Añadir tarea',
        'Agenda',
        'tasks',
        { id, title, pri, time, rem: !!time, done: false, tags: '' },
        [{ label: 'Tarea', value: title }, { label: 'Prioridad', value: PRI_LABEL[pri] }, ...(time ? [{ label: 'Hora', value: time }] : [])],
        `Tarea añadida: «${title}» (prioridad ${pri}).`,
      );
    }
    case 'add_idea': {
      const title = str(args.title);
      if (!title) return fail('Guardar idea', 'Ideas', 'Falta el título de la idea.');
      const category = pick(args.category, IDEA_CATEGORIES, 'app');
      const body = str(args.body);
      return add(
        'Guardar idea',
        'Ideas',
        'ideas',
        { id, title, body, category, tags: '' },
        [{ label: 'Idea', value: title }, { label: 'Categoría', value: category }, ...(body ? [{ label: 'Detalle', value: body }] : [])],
        `Idea guardada: «${title}».`,
      );
    }
    case 'add_goal': {
      const title = str(args.title);
      if (!title) return fail('Crear meta', 'Metas', 'Falta el título de la meta.');
      const target = Math.max(1, Math.round(numberOr(args.target, 1)));
      const unit = str(args.unit).slice(0, 40);
      const category = pick(args.category, GOAL_CATEGORIES, 'personal');
      const deadline = isDay(str(args.deadline)) ? str(args.deadline) : '';
      return add(
        'Crear meta',
        'Metas',
        'goals',
        { id, title, target, current: 0, unit, deadline, category, done: false },
        [{ label: 'Meta', value: title }, { label: 'Objetivo', value: `${target}${unit ? ` ${unit}` : ''}` }, { label: 'Categoría', value: category }, ...(deadline ? [{ label: 'Fecha límite', value: deadline }] : [])],
        `Meta creada: «${title}» (objetivo ${target}${unit ? ` ${unit}` : ''}).`,
      );
    }
    case 'add_transaction': {
      const amount = Math.round(Math.abs(numberOr(args.amount, 0)) * 100) / 100;
      if (!amount) return fail('Registrar movimiento', 'Finanzas', 'Falta el monto.');
      const type = pick(args.type, TX_TYPES, 'expense');
      const category = str(args.category).slice(0, 60) || 'Otro';
      const note = str(args.note).slice(0, 300);
      const label = type === 'income' ? 'ingreso' : 'gasto';
      return add(
        type === 'income' ? 'Registrar ingreso' : 'Registrar gasto',
        'Finanzas',
        'transactions',
        { id, date: today, amount, type, category, note },
        [{ label: 'Monto', value: new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(amount) }, { label: 'Categoría', value: category }, ...(note ? [{ label: 'Nota', value: note }] : []), { label: 'Fecha', value: today }],
        `Registré un ${label} de ${amount} (${category}).`,
      );
    }
    case 'log_water': {
      const glasses = Math.max(1, Math.min(20, Math.round(numberOr(args.glasses, 1))));
      const { water } = waterPatch(data, glasses, today);
      return {
        ...base,
        title: 'Registrar agua',
        where: 'Rutina',
        fields: [{ label: 'Vasos', value: `+${glasses}` }, { label: 'Total de hoy', value: `${water}` }],
        plan: { kind: 'water', glasses, today },
        done: `Registré ${glasses} ${glasses === 1 ? 'vaso' : 'vasos'} de agua. Lleva ${water} hoy.`,
      };
    }
    case 'log_workout': {
      const plan = str(args.plan).slice(0, 120) || 'Entrenamiento';
      const minutes = Math.round(numberOr(args.minutes, 0));
      if (minutes < 1) return fail('Registrar entreno', 'Ejercicio', 'Falta cuántos minutos duró.');
      return add('Registrar entreno', 'Ejercicio', 'workouts', { id, date: today, plan, minutes: Math.min(minutes, 1440) }, [{ label: 'Entreno', value: plan }, { label: 'Minutos', value: String(Math.min(minutes, 1440)) }, { label: 'Fecha', value: today }], `Registré el entreno «${plan}» (${minutes} min).`);
    }
    case 'log_sleep': {
      const bedtime = normTime(args.bedtime);
      const waketime = normTime(args.waketime);
      if (!bedtime || !waketime) return fail('Registrar sueño', 'Sueño', 'Faltan la hora de dormir y la de despertar (HH:MM).');
      const quality = Math.max(1, Math.min(5, Math.round(numberOr(args.quality, 3))));
      const mins = sleepMinutes(bedtime, waketime) ?? 0;
      return add(
        'Registrar sueño',
        'Sueño',
        'sleep',
        { id, date: today, bedtime, waketime, quality, note: '' },
        [{ label: 'Horario', value: `${bedtime} → ${waketime}` }, { label: 'Duración', value: `${Math.floor(mins / 60)} h ${mins % 60} min` }, { label: 'Calidad', value: `${quality} de 5` }],
        `Registré el sueño (${bedtime} → ${waketime}).`,
      );
    }
    case 'add_journal': {
      const mood = str(args.mood).slice(0, 16);
      const gratitude = str(args.gratitude);
      const note = str(args.note);
      if (!mood && !gratitude && !note) return fail('Escribir en el diario', 'Diario', 'No hay nada que escribir.');
      const fields = [...(mood ? [{ label: 'Ánimo', value: mood }] : []), ...(gratitude ? [{ label: 'Gratitud', value: gratitude }] : []), ...(note ? [{ label: 'Nota', value: note }] : [])];
      // Una entrada por día: si ya hay una de hoy, se añade al final de lo escrito.
      const existing = legacyList(data, 'journal').find((j) => j.date === today);
      if (existing) {
        const join = (a: unknown, b: string) => (b ? (str(a) ? `${str(a)}\n\n${b}` : b) : undefined);
        const patch: Json = {};
        if (mood) patch.mood = mood;
        const g = join(existing.gratitude, gratitude);
        const n = join(existing.note, note);
        if (g !== undefined) patch.gratitude = g;
        if (n !== undefined) patch.note = n;
        return { ...base, title: 'Añadir al diario de hoy', where: 'Diario', fields, plan: { kind: 'update', key: 'journal', id: existing.id, patch }, done: 'Añadí lo escrito a la entrada de hoy del diario.' };
      }
      return add('Escribir en el diario', 'Diario', 'journal', { id, date: today, mood, gratitude, note }, fields, 'Escribí la entrada de hoy del diario.');
    }
    case 'add_routine': {
      const title = str(args.title);
      const time = normTime(args.time);
      if (!title || !time) return fail('Añadir a la rutina', 'Rutina', 'Faltan el título o una hora válida (HH:MM).');
      const d = str(args.days);
      const days = /^[1-7]{1,7}$/.test(d) ? [...new Set(d)].sort().join('') : '1234567';
      return add(
        'Añadir a la rutina',
        'Rutina',
        'routines',
        { id, title, time, days, icon: 'bell', sound: true, enabled: true },
        [{ label: 'Recordatorio', value: title }, { label: 'Hora', value: time }, { label: 'Días', value: daysText(days) }],
        `Agendé «${title}» a las ${time} en la rutina.`,
      );
    }
    default:
      return fail('Acción desconocida', '', `El asistente pidió una acción que no existe (${call.function.name}).`);
  }
}

/** Agua de hoy tras sumar `glasses` vasos (máximo 40, como la app anterior). */
export function waterPatch(data: LegacyData | undefined, glasses: number, today: string): { dateKey: string; water: number } {
  return { dateKey: today, water: Math.min(40, waterToday(legacyObject(data, 'dayLog', today), today) + glasses) };
}

// ---------- Contexto (solo si la persona lo activa) ----------

/** Lo que el contexto usa del panel (`Dashboard` de @dyc/api-client cumple esta forma). */
export interface AssistantDashboard {
  overall: { score: number | null };
  pillars: Array<{ id: PillarId; score: number | null }>;
  checkIns: { count: number; streak: number };
  habits: { done: number; scheduled: number };
  todayStatus: { habits: Array<{ title: string; done: boolean }> };
}

const clip = (s: unknown, n = 80) => {
  const t = str(s).replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const money = (n: number) => new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(n);

/**
 * Resumen compacto de tus datos que se envía solo con el interruptor activado.
 * Nunca incluye la Bóveda, las notas, el texto del diario ni la clave.
 */
export function buildContext(data: LegacyData | undefined, dashboard: AssistantDashboard | undefined, now: Date = new Date()): string {
  const today = utcDayKey(now);
  // Día de la semana local para la rutina (como la sección Rutina) y fecha en UTC (como la app anterior).
  const iso = now.getDay() === 0 ? 7 : now.getDay();
  const utcIso = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  const lines: string[] = [`Hoy es ${DAY_NAMES[utcIso - 1]} ${today}.`];
  const list = (label: string, items: string[], max = 10) => {
    if (items.length) lines.push(`${label} (${items.length}): ${items.slice(0, max).join('; ')}${items.length > max ? '; …' : ''}.`);
  };

  list('Pendientes por hacer', legacyList(data, 'todos').filter((t) => !t.done).map((t) => clip(t.title)));
  list('Tareas de la agenda sin hacer', legacyList(data, 'tasks').filter((t) => !t.done).map((t) => `${clip(t.title)} [${t.pri}${t.time ? `, ${t.time}` : ''}]`));
  list(
    'Rutina de hoy',
    legacyList(data, 'routines')
      .filter((r) => r.enabled !== false && onWeekday(r.days, iso))
      .sort((a, b) => (a.time < b.time ? -1 : 1))
      .map((r) => `${r.time} ${clip(r.title)}`),
  );
  list('Metas en curso', legacyList(data, 'goals').filter((g) => !g.done).map((g) => `${clip(g.title)} (${g.current ?? 0} de ${g.target}${g.unit ? ` ${clip(g.unit, 20)}` : ''})`));
  const month = monthSummary(legacyList(data, 'transactions'), today.slice(0, 7));
  if (month.income || month.expense) lines.push(`Finanzas de este mes: ingresos ${money(month.income)}, gastos ${money(month.expense)}, balance ${money(month.balance)}.`);
  const log = legacyObject(data, 'dayLog', today);
  lines.push(`Agua hoy: ${waterToday(log, today)} de ${typeof log.waterGoal === 'number' ? log.waterGoal : WATER_GOAL_DEFAULT} vasos.`);
  const night = legacyList(data, 'sleep')
    .filter((s) => isDay(s.date))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const mins = night ? sleepMinutes(night.bedtime, night.waketime) : null;
  if (night && mins !== null) lines.push(`Última noche registrada (${night.date}): ${Math.floor(mins / 60)} h ${mins % 60} min, calidad ${typeof night.quality === 'number' ? `${night.quality} de 5` : 'sin anotar'}.`);
  const w = workoutStats(legacyList(data, 'workouts'), today);
  lines.push(`Entrenos esta semana: ${w.weekCount} (${w.weekMinutes} min).`);
  lines.push(`Diario de hoy: ${legacyList(data, 'journal').some((j) => j.date === today) ? 'ya escrito' : 'sin escribir'}.`);

  if (dashboard) {
    const pillars = dashboard.pillars.filter((p) => p.score !== null).map((p) => `${PILLAR_NAMES[p.id]} ${p.score}`);
    if (dashboard.overall.score !== null) lines.push(`Panel de la semana: puntuación global ${dashboard.overall.score} de 100${pillars.length ? ` (${pillars.join(', ')})` : ''}.`);
    lines.push(`Check-ins: ${dashboard.checkIns.count} esta semana, racha de ${dashboard.checkIns.streak} días. Hábitos de la semana: ${dashboard.habits.done} de ${dashboard.habits.scheduled}.`);
    list('Hábitos de hoy', dashboard.todayStatus.habits.map((h) => `${clip(h.title)} (${h.done ? 'hecho' : 'pendiente'})`));
  }
  return lines.join('\n');
}

export function systemPrompt(context: string | null, now: Date = new Date()): string {
  const parts = [
    'Eres el asistente de Design Your Core, una app de bienestar y organización personal. Responde siempre en español, con calidez y en pocas frases. Puedes usar Markdown sencillo.',
    `La fecha de hoy es ${utcDayKey(now)}.`,
    'Cuando la persona pida añadir, registrar o agendar algo, usa la herramienta adecuada (add_todo, add_task, add_idea, add_goal, add_transaction, log_water, log_workout, log_sleep, add_journal, add_routine). Cada acción se le muestra como propuesta y solo se hace si pulsa «Hacer»: no digas que ya está hecha hasta recibir el resultado.',
    'Si faltan datos obligatorios (por ejemplo la hora o los minutos), pregunta antes de proponer la acción. No inventes datos.',
    'La persona puede adjuntar imágenes, PDF y archivos de texto: léelos y úsalos para responder.',
  ];
  if (context) parts.push(`Resumen de los datos de la persona (lo ha compartido para esta conversación):\n${context}`);
  else parts.push('No tienes acceso a los datos de la persona: si te pregunta por ellos, dile que puede activar «Incluir un resumen de mis datos».');
  return parts.join('\n\n');
}

// ---------- Mensajes y peticiones ----------

/** Un mensaje de la conversación. Los adjuntos llevan su data: URL solo en memoria. */
export type ChatMessage = StoredChatMessage;

export function buildRequest(model: string, history: ChatMessage[], context: string | null, now?: Date) {
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt(context, now) },
      ...history.map((m) =>
        m.role === 'assistant'
          ? m.tool_calls?.length
            ? { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls }
            : { role: 'assistant', content: m.content }
          : m.role === 'user'
            ? { role: 'user', content: userContent(m.content, m.attachments) }
            : m,
      ),
    ],
    tools: TOOLS,
    tool_choice: 'auto',
    // Sin esto Gemini «piensa» a fondo antes de cada respuesta y tarda muchos segundos.
    // `low` es el nivel más bajo que aceptan todos los modelos de la lista.
    reasoning_effort: REASONING_EFFORT,
  };
}

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AssistantError';
  }
  /** Saturado o fallo de Google: vale la pena otro modelo. */
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

/** Mensaje claro en español según la respuesta de Google. */
export function errorFor(status: number, detail = ''): AssistantError {
  const keyProblem = /api[ _-]?key/i.test(detail);
  if (status === 0) return new AssistantError('No se pudo conectar con Gemini. Revisa tu conexión a internet e inténtalo de nuevo.', 0);
  if (status === 401 || status === 403 || (status === 400 && keyProblem))
    return new AssistantError('Google no aceptó tu clave. Revisa que la hayas copiado entera y que sea una clave de la API de Gemini activa.', status);
  if (status === 404) return new AssistantError('Ese modelo no está disponible con tu clave. Elige otro modelo.', status);
  if (status === 429) return new AssistantError('Tu clave de Gemini llegó a su límite de uso. Espera un poco o revisa tu cuota en Google AI Studio.', status);
  if (status >= 500) return new AssistantError('El servicio de Gemini está fallando o saturado ahora mismo. Inténtalo de nuevo en unos minutos.', status);
  return new AssistantError(`Google rechazó la petición (error ${status}).`, status);
}

async function detailOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as unknown;
    const err = (Array.isArray(body) ? body[0] : body) as { error?: { message?: unknown } } | undefined;
    return typeof err?.error?.message === 'string' ? err.error.message : '';
  } catch {
    return '';
  }
}

export async function postGemini(apiKey: string, body: unknown, fetchImpl: typeof fetch, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Json> {
  // Un controlador propio para cortar por tiempo; también sigue a la señal de quien llama («Detener»).
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const follow = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener('abort', follow);
  try {
    let res: Response;
    try {
      res = await fetchImpl(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        // En el navegador, sin cookies ni página de origen (React Native los ignora).
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (e) {
      if (timedOut) throw tooSlow();
      if ((e as Error)?.name === 'AbortError') throw e;
      throw errorFor(0);
    }
    if (!res.ok) throw errorFor(res.status, await detailOf(res));
    try {
      return (await res.json()) as Json;
    } catch (e) {
      if (timedOut) throw tooSlow();
      if ((e as Error)?.name === 'AbortError') throw e;
      throw new AssistantError('Gemini respondió algo que no se pudo leer.', 502);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', follow);
  }
}

const tooSlow = () => new AssistantError('Gemini tardó demasiado en responder. Inténtalo de nuevo o elige un modelo más rápido.', 504);

export interface ChatReply {
  message: Extract<ChatMessage, { role: 'assistant' }>;
  model: string;
  /** Se usó el modelo de reserva porque el elegido falló. */
  fellBack: boolean;
}

/** Lee el mensaje del modelo: texto y llamadas a herramientas. */
export function parseReply(data: Json): Extract<ChatMessage, { role: 'assistant' }> {
  const choice = (data.choices as Array<{ message?: { content?: unknown; tool_calls?: unknown } }> | undefined)?.[0];
  const msg = choice?.message;
  if (!msg) throw new AssistantError('Gemini no devolvió ninguna respuesta.', 502);
  const content = typeof msg.content === 'string' ? msg.content : '';
  const calls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : [])
    .filter((c): c is { id?: unknown; function: { name: unknown; arguments?: unknown } } => !!c && typeof c === 'object' && !!(c as { function?: unknown }).function)
    .map((c, i) => ({
      id: typeof c.id === 'string' && c.id ? c.id : `llamada_${Date.now().toString(36)}_${i}`,
      type: 'function' as const,
      function: { name: String(c.function.name ?? ''), arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments ?? {}) },
    }));
  return calls.length ? { role: 'assistant', content, tool_calls: calls } : { role: 'assistant', content };
}

/** Envía la conversación. Ante 429 o 5xx reintenta una vez con el modelo de reserva. */
export async function chat(opts: { apiKey: string; model: string; history: ChatMessage[]; context: string | null; fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<ChatReply> {
  const f = opts.fetchImpl ?? fetch;
  try {
    const data = await postGemini(opts.apiKey, buildRequest(opts.model, opts.history, opts.context), f, opts.signal);
    return { message: parseReply(data), model: opts.model, fellBack: false };
  } catch (e) {
    if (!(e instanceof AssistantError) || !e.retryable || opts.model === FALLBACK_MODEL) throw e;
    const data = await postGemini(opts.apiKey, buildRequest(FALLBACK_MODEL, opts.history, opts.context), f, opts.signal);
    return { message: parseReply(data), model: FALLBACK_MODEL, fellBack: true };
  }
}

// ---------- Historial ----------

/** Acción propuesta con su estado en la conversación. */
export type ChatCard = Proposal & { status: CardStatus; error?: string };

/** Título de una conversación: el primer mensaje, o el nombre del primer archivo. */
export function chatTitle(messages: ChatMessage[]): string {
  const first = messages.find((m): m is Extract<ChatMessage, { role: 'user' }> => m.role === 'user');
  const t = (first?.content || first?.attachments?.[0]?.name || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Conversación';
  return t.length > 60 ? `${t.slice(0, 59)}…` : t;
}

/** La conversación lista para guardarla en tu cuenta (sin las data: URL de los adjuntos). */
export function storedChat(id: string, model: string, messages: ChatMessage[], cards: Record<string, ChatCard>, now: Date = new Date()): LegacyChat {
  const keep: Record<string, StoredCard> = {};
  for (const [k, c] of Object.entries(cards)) {
    // Una acción a medias se guarda como pendiente: al volver a abrirla se puede hacer o descartar.
    keep[k] = { callId: c.callId, tool: c.tool, title: c.title, where: c.where, fields: c.fields, plan: (c.plan as Record<string, unknown> | null) ?? null, done: c.done, status: c.status === 'running' ? 'pending' : c.status, ...(c.error ? { error: c.error.slice(0, 1000) } : {}) };
  }
  return {
    id,
    title: chatTitle(messages),
    model,
    updatedAt: now.toISOString(),
    messages: messages.map((m) => (m.role === 'user' && m.attachments?.length ? { ...m, attachments: m.attachments.map(storedAttachment) } : m)),
    cards: keep,
  };
}

/** Cartas guardadas → cartas para la pantalla (los datos raros se quedan sin «Hacer»). */
export function chatCards(chat: Pick<LegacyChat, 'cards'>): Record<string, ChatCard> {
  const out: Record<string, ChatCard> = {};
  for (const [k, c] of Object.entries(chat.cards ?? {})) {
    if (!c || typeof c !== 'object') continue;
    const plan = isPlan(c.plan) ? c.plan : null;
    out[k] = { ...c, plan, status: c.status === 'running' ? 'pending' : plan || c.status !== 'pending' ? c.status : 'invalid' };
  }
  return out;
}

const isPlan = (p: unknown): p is Plan => {
  const x = p as Partial<Record<string, unknown>> | null;
  if (!x || typeof x !== 'object') return false;
  if (x.kind === 'add') return typeof x.key === 'string' && !!x.item && typeof x.item === 'object';
  if (x.kind === 'update') return typeof x.key === 'string' && typeof x.id === 'string' && !!x.patch && typeof x.patch === 'object';
  if (x.kind === 'water') return typeof x.glasses === 'number' && typeof x.today === 'string';
  if (x.kind === 'batch') return Array.isArray(x.ops) && x.ops.every((o) => isPlan(o) && (o as Plan).kind !== 'batch' && (o as Plan).kind !== 'water');
  return false;
};

/** Ids de /api/images de los adjuntos que hay que volver a descargar al abrir una conversación. */
export const chatAttachmentRefs = (messages: ChatMessage[]): string[] =>
  messages.flatMap((m) => (m.role === 'user' ? (m.attachments ?? []).filter((a) => a.kind !== 'text' && a.ref && !a.data).map((a) => a.ref) : []));

/** Vuelve a poner las data: URL descargadas en los adjuntos. */
export const withAttachmentData = (messages: ChatMessage[], data: Record<string, string>): ChatMessage[] =>
  messages.map((m) => (m.role === 'user' && m.attachments?.length ? { ...m, attachments: m.attachments.map((a) => (a.ref && data[a.ref]?.startsWith('data:') ? { ...a, data: data[a.ref] } : a)) } : m));

/** «Hoy 14:05», «ayer», «12 oct». */
export function chatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (day(d) === day(now)) return `Hoy ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (day(d) === day(y)) return 'Ayer';
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }).format(d);
}

/** «Probar conexión»: una petición mínima, sin datos ni herramientas. */
export async function testConnection(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await postGemini(apiKey, { model, messages: [{ role: 'user', content: 'Responde solo: ok' }], max_tokens: 16, reasoning_effort: REASONING_EFFORT }, fetchImpl);
}

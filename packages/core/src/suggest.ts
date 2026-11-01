import { z } from 'zod';
import {
  AssistantError,
  FALLBACK_MODEL,
  parseReply,
  postGemini,
  REASONING_EFFORT,
  type Plan,
  type Proposal,
  type ToolCall,
} from './assistant.js';
import {
  LEGACY_CROSS,
  LEGACY_NEWEST_FIRST,
  LEGACY_PARENT,
  legacyItemSchemas,
  legacyList,
  legacyPatchSchemas,
  utcDayKey,
  type LegacyData,
  type LegacyKey,
} from './legacy.js';
import { TOOL_CATALOG, type ToolId } from './tools.js';

/**
 * Sugerencias de cada sección: Gemini (con la clave de la persona) mira los
 * datos de esa sección y propone de 1 a 3 cambios concretos («añade esto»,
 * «mejora esto así»). Cada uno se valida con los mismos esquemas que el
 * servidor y solo se escribe si la persona pulsa «Hacer».
 */

interface SectionInfo {
  /** Claves que se pueden cambiar. */
  keys: LegacyKey[];
  /** Otras claves que se leen solo para dar contexto. */
  read?: LegacyKey[];
  /** En qué fijarse. */
  focus: string;
}

export const SUGGEST_SECTIONS: Partial<Record<ToolId, SectionInfo>> = {
  agenda: { keys: ['blocks', 'tasks'], focus: 'organizar mejor el día con bloques de tiempo realistas y tareas con prioridad y hora' },
  pendientes: { keys: ['todos', 'subtasks'], focus: 'dividir los pendientes grandes en subtareas, aclarar títulos vagos y añadir lo que falta' },
  calendario: { keys: ['reminders'], focus: 'eventos y recordatorios del mes que conviene anotar o aclarar' },
  horario: { keys: ['classes'], read: ['subjects'], focus: 'completar el horario de clases (aula, materia, horas) y detectar huecos o choques' },
  enfoque: { keys: ['blocks', 'tasks'], read: ['focus'], focus: 'planear sesiones de enfoque (bloques de estudio o trabajo) según cómo se ha concentrado' },
  materias: { keys: ['subjects'], read: ['classes'], focus: 'completar las materias con profesor, aula, próxima clase y una lista de temas' },
  cursos: { keys: ['courses'], focus: 'organizar los cursos por tema, cambiar el estado de los que avanzan y proponer cursos o videos útiles para sus temas' },
  proyectos: { keys: ['projects'], focus: 'añadir hitos con fecha a los proyectos y aclarar fechas de entrega' },
  roadmaps: { keys: ['roadmaps'], focus: 'proponer los siguientes pasos concretos de cada ruta de estudio' },
  cuadernos: { keys: ['notebooks', 'noteBoxes'], focus: 'añadir cajitas de apuntes útiles (resúmenes, preguntas de repaso) a los cuadernos' },
  contenido: { keys: ['content'], focus: 'mejorar ideas de video: títulos, notas, guion y siguiente etapa' },
  ideas: { keys: ['ideas'], focus: 'desarrollar las ideas con más detalle y proponer ideas relacionadas' },
  trabajo: { keys: ['workItems'], focus: 'ordenar las tareas de trabajo y dividir las grandes' },
  emprendimientos: { keys: ['ventures', 'ventureItems'], focus: 'siguientes pasos de cada emprendimiento: notas con plan, tareas, enlaces útiles y mejor descripción' },
  notas: { keys: ['notes'], focus: 'organizar las notas (títulos, materia, etiquetas) y proponer notas de resumen' },
  finanzas: { keys: ['goals', 'transactions'], read: [], focus: 'metas de ahorro realistas según sus ingresos y gastos, y corregir categorías mal puestas. No inventes movimientos de dinero' },
  metas: { keys: ['goals'], focus: 'metas más concretas y medibles, con unidad y fecha límite' },
  mascotas: { keys: ['pets', 'petCares'], focus: 'cuidados que faltan para cada mascota (comida, paseo, vacunas) con hora y días' },
  ejercicio: { keys: ['routines', 'goals'], read: ['workouts'], focus: 'recordatorios de entreno en la rutina y metas de ejercicio según su historial. No inventes entrenos hechos' },
  sueno: { keys: ['routines'], read: ['sleep'], focus: 'recordatorios en la rutina para dormir mejor según sus horarios de sueño. No inventes noches' },
  diario: { keys: ['routines'], read: ['journal'], focus: 'un hábito de escritura y recordatorios según su ánimo. No escribas entradas del diario por la persona' },
  rutina: { keys: ['routines', 'meals'], focus: 'una rutina diaria equilibrada: horarios, comidas y descansos' },
  ciclo: { keys: ['routines'], read: ['period'], focus: 'recordatorios útiles alrededor de su ciclo. No inventes registros' },
};

export const canSuggest = (tool: ToolId): boolean => !!SUGGEST_SECTIONS[tool];

/** Sustantivo de cada clave para la vista previa. */
const KEY_NOUN: Partial<Record<LegacyKey, string>> = {
  blocks: 'Bloque',
  tasks: 'Tarea',
  todos: 'Pendiente',
  subtasks: 'Subtarea',
  reminders: 'Evento',
  classes: 'Clase',
  subjects: 'Materia',
  courses: 'Curso',
  projects: 'Proyecto',
  roadmaps: 'Ruta',
  notebooks: 'Cuaderno',
  noteBoxes: 'Cajita',
  content: 'Video',
  ideas: 'Idea',
  workItems: 'Tarea de trabajo',
  ventures: 'Emprendimiento',
  ventureItems: 'Elemento',
  notes: 'Nota',
  transactions: 'Movimiento',
  goals: 'Meta',
  pets: 'Mascota',
  petCares: 'Cuidado',
  routines: 'Rutina',
  meals: 'Comida',
};

const FIELD_LABEL: Record<string, string> = {
  title: 'Título', name: 'Nombre', label: 'Nombre', sub: 'Detalle', start: 'Inicio', dur: 'Duración', kind: 'Tipo', pri: 'Prioridad', time: 'Hora', done: 'Hecho',
  tags: 'Etiquetas', day: 'Día', when: 'Cuándo', end: 'Fin', room: 'Aula', teacher: 'Profesor', nextClass: 'Próxima clase', topics: 'Temas', subject: 'Materia',
  deadline: 'Fecha límite', status: 'Estado', milestones: 'Hitos', steps: 'Pasos', category: 'Categoría', body: 'Texto', text: 'Texto', stage: 'Etapa',
  platform: 'Plataforma', notes: 'Notas', script: 'Guion', due: 'Para', amount: 'Monto', type: 'Tipo', note: 'Nota', target: 'Objetivo', current: 'Llevas',
  unit: 'Unidad', species: 'Especie', days: 'Días', date: 'Fecha', minutes: 'Minutos', plan: 'Plan', url: 'Enlace', topic: 'Tema', description: 'Descripción',
  project: 'Proyecto', color: 'Color', enabled: 'Activo', sound: 'Sonido', icon: 'Icono', dateKey: 'Fecha', lang: 'Lenguaje',
};

/** Pistas para los campos que no se entienden solo por el tipo. */
const FIELD_HINT: Record<string, string> = {
  'blocks.start': 'hora de inicio en horas decimales (9.5 = 9:30)',
  'blocks.dur': 'duración en horas (1.5 = hora y media)',
  'classes.day': '1 = lunes … 7 = domingo',
  'reminders.day': 'día del mes actual (1-31)',
  'routines.days': 'dígitos 1-7 sin repetir (1 = lunes), "12345" = entre semana',
  'petCares.days': 'dígitos 1-7 sin repetir (1 = lunes)',
  'meals.dateKey': 'día AAAA-MM-DD',
  'ventureItems.kind': 'solo "note" o "link" (las imágenes y archivos los sube la persona)',
};

/** Tipo de un campo, en pocas palabras, para el modelo. */
function typeText(t: z.ZodTypeAny): string {
  if (t instanceof z.ZodOptional || t instanceof z.ZodDefault) return typeText(t._def.innerType);
  if (t instanceof z.ZodNullable) return `${typeText(t._def.innerType)} o null`;
  if (t instanceof z.ZodEffects) return typeText(t._def.schema);
  if (t instanceof z.ZodString) return 'texto';
  if (t instanceof z.ZodNumber) return 'número';
  if (t instanceof z.ZodBoolean) return 'true/false';
  if (t instanceof z.ZodEnum) return (t.options as string[]).map((o) => JSON.stringify(o)).join(' | ');
  if (t instanceof z.ZodLiteral) return JSON.stringify(t.value);
  if (t instanceof z.ZodUnion) return (t.options as z.ZodTypeAny[]).map(typeText).join(' o ');
  if (t instanceof z.ZodArray) return `lista de ${typeText(t.element)}`;
  if (t instanceof z.ZodObject) return `{ ${Object.entries(t.shape as Record<string, z.ZodTypeAny>).map(([k, v]) => `${k}: ${typeText(v)}`).join(', ')} }`;
  return 'valor';
}

/** Campos obligatorios al crear: los que faltan si solo se da el id. */
function requiredFields(key: LegacyKey): string[] {
  const r = legacyItemSchemas[key].safeParse({ id: 'x' });
  if (r.success) return [];
  return [...new Set(r.error.issues.filter((i) => i.code === 'invalid_type' && i.received === 'undefined').map((i) => String(i.path[0])))];
}

/** Descripción de los campos de una clave para el modelo. */
export function describeKey(key: LegacyKey): string {
  const shape = legacyPatchSchemas[key].shape as Record<string, z.ZodTypeAny>;
  const req = new Set(requiredFields(key));
  const lines = Object.entries(shape).map(([f, t]) => {
    const hint = FIELD_HINT[`${key}.${f}`];
    return `  - ${f}${req.has(f) ? ' (obligatorio)' : ''}: ${typeText(t)}${hint ? ` — ${hint}` : ''}`;
  });
  return `${key} (${KEY_NOUN[key] ?? key}):\n${lines.join('\n')}`;
}

const clipStr = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Un elemento recortado para el contexto (sin textos largos ni privados). */
function redact(key: LegacyKey, item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (key === 'journal' && (k === 'gratitude' || k === 'note')) continue;
    if (key === 'notes' && (k === 'body' || k === 'shareId' || k === 'commit')) continue;
    if (key === 'ventureItems' && k === 'ref') continue;
    out[k] = typeof v === 'string' ? clipStr(v, key === 'noteBoxes' || key === 'ventureItems' || key === 'ideas' || key === 'content' ? 600 : 300) : v;
  }
  return out;
}

const MAX_ITEMS = 80;
const MAX_CONTEXT = 30_000;

/** Los datos de la sección que se envían a Gemini (lo que la persona puede ver antes de pedir). */
export function suggestContext(tool: ToolId, data: LegacyData | undefined): string {
  const info = SUGGEST_SECTIONS[tool];
  if (!info) return '';
  const blocks: string[] = [];
  for (const key of [...info.keys, ...(info.read ?? [])]) {
    const all = legacyList(data, key) as unknown as Array<Record<string, unknown>>;
    // Las listas que guardan lo más nuevo primero se leen desde el principio.
    const items = LEGACY_NEWEST_FIRST[key] ? all.slice(0, MAX_ITEMS) : all.slice(-MAX_ITEMS);
    blocks.push(`${key}${info.keys.includes(key) ? '' : ' (solo lectura)'}: ${items.length ? JSON.stringify(items.map((i) => redact(key, i))) : '[] (vacío)'}${all.length > items.length ? ` (y ${all.length - items.length} más)` : ''}`);
  }
  const text = blocks.join('\n');
  return text.length > MAX_CONTEXT ? `${text.slice(0, MAX_CONTEXT)}… (recortado)` : text;
}

const SUGGEST_TOOL = (keys: LegacyKey[]) => ({
  type: 'function' as const,
  function: {
    name: 'suggest_change',
    description: 'Propone un cambio concreto en la sección. Se le muestra a la persona con un botón «Hacer» y solo se aplica si lo pulsa.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Frase corta en imperativo, por ejemplo «Divide "Estudiar física" en 3 subtareas».' },
        reason: { type: 'string', description: 'Por qué ayuda, en una frase.' },
        action: { type: 'string', enum: ['add', 'update'] },
        key: { type: 'string', enum: keys },
        id: { type: 'string', description: 'Solo en update: id del elemento que se cambia.' },
        fields: {
          type: 'string',
          description:
            'JSON con los campos. En add: un objeto o una lista de objetos (para añadir varios a la vez); si un elemento nuevo es padre de otro de la misma lista, dale un "id" inventado y úsalo en el hijo. En update: un objeto solo con los campos que cambian.',
        },
      },
      required: ['title', 'reason', 'action', 'key', 'fields'],
    },
  },
});

export function suggestRequest(model: string, tool: ToolId, data: LegacyData | undefined, opts: { avoid?: string[]; now?: Date } = {}) {
  const info = SUGGEST_SECTIONS[tool];
  if (!info) throw new AssistantError('Esta sección no tiene sugerencias.', 400);
  const label = TOOL_CATALOG.find((t) => t.id === tool)?.label ?? tool;
  const system = [
    `Eres el asistente de Design Your Core, una app de organización personal y bienestar. Revisa la sección «${label}» de la persona y propone de 1 a 3 mejoras concretas y útiles: añadir algo que falta o mejorar algo que ya existe. En esta sección fíjate sobre todo en: ${info.focus}.`,
    'Cada propuesta es UNA llamada a suggest_change, con los campos exactos del formato de abajo. Haz todas las llamadas en esta misma respuesta. Escribe siempre en español, con títulos y textos naturales.',
    'Si la sección está vacía, propone cómo empezar con elementos razonables y genéricos. No inventes datos personales (nombres de personas, montos, fechas de exámenes) que no aparezcan en los datos.',
    `La fecha de hoy es ${utcDayKey(opts.now)}. Responde también con una sola frase breve que presente las sugerencias.`,
  ].join('\n\n');
  const user = [
    `Formato de cada clave que puedes cambiar (el id lo pone la app al crear):\n${info.keys.map(describeKey).join('\n\n')}`,
    `Datos actuales de la sección:\n${suggestContext(tool, data)}`,
    ...(opts.avoid?.length ? [`No repitas estas sugerencias que ya se mostraron: ${opts.avoid.map((a) => `«${a}»`).join(', ')}.`] : []),
  ].join('\n\n');
  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    tools: [SUGGEST_TOOL(info.keys)],
    tool_choice: 'auto',
    reasoning_effort: REASONING_EFFORT,
  };
}

type Json = Record<string, unknown>;

function fmtValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? String((x as Json).name ?? (x as Json).title ?? '') : String(x))).filter(Boolean).join(', ') || '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return clipStr(String(v), 300);
}

const mainName = (x: Json) => String(x.title || x.name || x.label || x.topic || x.plan || x.date || '').trim();

/** Rellena el id de los subelementos (temas, hitos, pasos) que el modelo dejó sin id. */
function withChildIds(item: Json, newId: () => string): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(item)) {
    out[k] = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' && !Array.isArray(x) && !(x as Json).id ? { id: newId(), ...(x as Json) } : x)) : v;
  }
  return out;
}

/**
 * Convierte una sugerencia del modelo en una acción propuesta, validada como
 * en el servidor. Las que no sirven devuelven `plan: null` y `error`.
 */
export function planSuggestion(call: ToolCall, tool: ToolId, data: LegacyData | undefined, opts: { newId: () => string }): Proposal & { reason: string } {
  const info = SUGGEST_SECTIONS[tool];
  let args: Json = {};
  try {
    const p = JSON.parse(call.function.arguments || '{}');
    if (p && typeof p === 'object' && !Array.isArray(p)) args = p as Json;
  } catch {
    /* se queda vacío */
  }
  const title = clipStr(String(args.title ?? '').trim(), 200) || 'Sugerencia';
  const reason = clipStr(String(args.reason ?? '').trim(), 400);
  const key = String(args.key ?? '') as LegacyKey;
  const base = { callId: call.id, tool: 'suggest_change', title, reason, where: KEY_NOUN[key] ?? '', fields: [] as Proposal['fields'], done: title };
  const fail = (error: string) => ({ ...base, plan: null, error });
  if (call.function.name !== 'suggest_change' || !info) return fail('Sugerencia desconocida.');
  if (!info.keys.includes(key)) return fail('La sugerencia es de otra sección.');

  let fields: unknown = args.fields;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields);
    } catch {
      return fail('Los datos de la sugerencia no se pudieron leer.');
    }
  }
  const allowed = new Set(['id', ...Object.keys(legacyPatchSchemas[key].shape as object)]);
  const clean = (x: unknown): Json => Object.fromEntries(Object.entries(x && typeof x === 'object' && !Array.isArray(x) ? (x as Json) : {}).filter(([k]) => allowed.has(k)));
  const existing = (k: LegacyKey) => new Set(legacyList(data, k).map((x) => (x as { id: string }).id));

  if (args.action === 'update') {
    const id = String(args.id ?? '');
    const current = (legacyList(data, key) as unknown as Json[]).find((x) => x.id === id);
    if (!current) return fail('El elemento que quiere cambiar no existe.');
    const { id: _ignored, ...raw } = withChildIds(clean(fields), opts.newId);
    if (!Object.keys(raw).length) return fail('La sugerencia no cambia nada.');
    const r = legacyPatchSchemas[key].safeParse(raw);
    if (!r.success) return fail(r.error.issues[0]?.message ?? 'Datos no válidos');
    const patch = r.data as Json;
    const cross = LEGACY_CROSS[key];
    const crossError = cross && cross.fields.some((f) => f in patch) ? cross.check({ ...current, ...patch }) : null;
    if (crossError) return fail(crossError);
    const parent = LEGACY_PARENT[key];
    if (parent && typeof patch[parent.field] === 'string' && !existing(parent.key).has(patch[parent.field] as string)) return fail(parent.missing);
    const name = mainName(current) || 'elemento';
    return {
      ...base,
      where: `${KEY_NOUN[key] ?? key}: ${clipStr(name, 60)}`,
      fields: Object.entries(patch).map(([f, v]) => ({ label: FIELD_LABEL[f] ?? f, value: fmtValue(v) })),
      plan: { kind: 'update', key, id, patch },
    };
  }

  if (args.action !== 'add') return fail('Acción no válida.');
  const list = (Array.isArray(fields) ? fields : [fields]).slice(0, 12);
  if (!list.length) return fail('La sugerencia no añade nada.');
  // Ids inventados por el modelo → ids nuevos (para enlazar padres e hijos de la misma sugerencia).
  const ids = new Map<string, string>();
  const raws = list.map((x) => {
    const c = clean(x);
    const id = opts.newId();
    if (typeof c.id === 'string' && c.id) ids.set(c.id, id);
    return { ...c, id };
  });
  const parent = LEGACY_PARENT[key];
  const ops: Array<Extract<Plan, { kind: 'add' }>> = [];
  const preview: Proposal['fields'] = [];
  for (const raw of raws) {
    const item = withChildIds(raw, opts.newId);
    if (parent && typeof item[parent.field] === 'string') {
      const ref = item[parent.field] as string;
      item[parent.field] = ids.get(ref) ?? ref;
      if (!existing(parent.key).has(item[parent.field] as string) && ![...ids.values()].includes(item[parent.field] as string)) return fail(parent.missing);
    }
    if (key === 'ventureItems' && item.kind !== 'note' && item.kind !== 'link') return fail('Solo se pueden sugerir notas y enlaces.');
    const r = legacyItemSchemas[key].safeParse(item);
    if (!r.success) return fail(r.error.issues[0]?.message ?? 'Datos no válidos');
    ops.push({ kind: 'add', key, item: r.data as Json & { id: string } });
    const extra = Object.entries(item)
      .filter(([f]) => f !== 'id' && f !== parent?.field && !['title', 'name', 'label'].includes(f))
      .map(([f, v]) => `${FIELD_LABEL[f] ?? f}: ${fmtValue(v)}`)
      .slice(0, 4);
    preview.push({ label: KEY_NOUN[key] ?? key, value: [mainName(item) || '—', ...extra].join(' · ') });
  }
  return { ...base, where: KEY_NOUN[key] ?? key, fields: preview, plan: ops.length === 1 ? ops[0] : { kind: 'batch', ops } };
}

export interface SuggestResult {
  intro: string;
  proposals: Array<Proposal & { reason: string }>;
  /** Cuántas sugerencias del modelo no se pudieron usar. */
  dropped: number;
  model: string;
  fellBack: boolean;
}

/** Pide sugerencias para una sección. Ante 429 o 5xx reintenta una vez con el modelo de reserva. */
export async function suggest(opts: {
  apiKey: string;
  model: string;
  tool: ToolId;
  data: LegacyData | undefined;
  newId: () => string;
  avoid?: string[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<SuggestResult> {
  const f = opts.fetchImpl ?? fetch;
  const run = async (model: string) => {
    const reply = parseReply(await postGemini(opts.apiKey, suggestRequest(model, opts.tool, opts.data, { avoid: opts.avoid }), f, opts.signal));
    const all = (reply.tool_calls ?? []).map((c) => planSuggestion(c, opts.tool, opts.data, { newId: opts.newId }));
    const proposals = all.filter((p) => p.plan).slice(0, 3);
    return { intro: reply.content.trim(), proposals, dropped: all.length - proposals.length, model, fellBack: model !== opts.model };
  };
  try {
    return await run(opts.model);
  } catch (e) {
    if (!(e instanceof AssistantError) || !e.retryable || opts.model === FALLBACK_MODEL) throw e;
    return run(FALLBACK_MODEL);
  }
}

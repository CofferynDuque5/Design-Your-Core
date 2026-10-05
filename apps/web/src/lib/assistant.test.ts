import { legacyItemSchemas, type LegacyData } from '@dyc/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_STORAGE_KEY,
  buildContext,
  buildRequest,
  chat,
  clearSettings,
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  GEMINI_URL,
  loadSettings,
  planTool,
  saveSettings,
  testConnection,
  TOOLS,
  type ChatMessage,
  type ToolCall,
} from './assistant';

const reply = (message: object, status = 200) => new Response(JSON.stringify(status === 200 ? { choices: [{ message }] } : message), { status, headers: { 'Content-Type': 'application/json' } });
const call = (name: string, args: object | string, id = 'c1'): ToolCall => ({ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
let n = 0;
const ids = { newId: () => `id${++n}`, today: '2026-09-25' };
const bodyOf = (f: ReturnType<typeof vi.fn>, i = 0) => JSON.parse(String((f.mock.calls[i][1] as RequestInit).body));

afterEach(() => localStorage.clear());

describe('Asistente: petición a Gemini', () => {
  it('construye la petición compatible con OpenAI con las 10 herramientas', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Añade pan' },
      { role: 'assistant', content: '', tool_calls: [call('add_todo', { title: 'pan' })] },
      { role: 'tool', tool_call_id: 'c1', content: 'Hecho.' },
    ];
    const body = buildRequest('gemini-flash-latest', history, null, new Date('2026-09-25T10:00:00Z'));
    expect(body.model).toBe('gemini-flash-latest');
    expect(body.tool_choice).toBe('auto');
    expect(body.tools.map((t) => t.function.name)).toEqual(['add_todo', 'add_task', 'add_idea', 'add_goal', 'add_transaction', 'log_water', 'log_workout', 'log_sleep', 'add_journal', 'add_routine']);
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[0].content).toContain('2026-09-25');
    expect(body.messages[0].content).toContain('No tienes acceso a los datos');
    expect(body.messages[2]).toEqual({ role: 'assistant', content: null, tool_calls: history[1].role === 'assistant' ? history[1].tool_calls : [] });
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'Hecho.' });
    expect(buildRequest('m', [], 'Agua hoy: 3 de 8 vasos.').messages[0].content).toContain('Agua hoy: 3 de 8 vasos.');
    expect(TOOLS.find((t) => t.function.name === 'add_task')?.function.parameters).toMatchObject({ required: ['title'], properties: { pri: { enum: ['alta', 'media', 'baja'] } } });
  });

  it('envía la clave como Bearer directamente a Google y lee texto y llamadas', async () => {
    const f = vi.fn(async () => reply({ content: 'Claro.', tool_calls: [{ id: 'x1', type: 'function', function: { name: 'log_water', arguments: '{"glasses":2}' } }] }));
    const out = await chat({ apiKey: 'clave-de-prueba', model: DEFAULT_MODEL, history: [{ role: 'user', content: 'Bebí 2 vasos' }], context: null, fetchImpl: f as unknown as typeof fetch });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GEMINI_URL);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer clave-de-prueba');
    expect(init.credentials).toBe('omit');
    expect(out).toEqual({ model: DEFAULT_MODEL, fellBack: false, message: { role: 'assistant', content: 'Claro.', tool_calls: [{ id: 'x1', type: 'function', function: { name: 'log_water', arguments: '{"glasses":2}' } }] } });
  });

  it('ante 429 o 5xx reintenta una vez con gemini-flash-lite-latest', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply({ error: { message: 'Resource exhausted' } }, 429)).mockResolvedValueOnce(reply({ content: 'Hola' }));
    const out = await chat({ apiKey: 'k', model: 'gemini-pro-latest', history: [{ role: 'user', content: 'hola' }], context: null, fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2);
    expect(bodyOf(f, 0).model).toBe('gemini-pro-latest');
    expect(bodyOf(f, 1).model).toBe(FALLBACK_MODEL);
    expect(out).toMatchObject({ model: FALLBACK_MODEL, fellBack: true, message: { content: 'Hola' } });

    const g = vi.fn().mockResolvedValue(reply({ error: { message: 'boom' } }, 503));
    await expect(chat({ apiKey: 'k', model: DEFAULT_MODEL, history: [], context: null, fetchImpl: g })).rejects.toThrow('El servicio de Gemini está fallando o saturado');
    expect(g).toHaveBeenCalledTimes(2);
  });

  it('errores claros en español y sin reintento para la clave', async () => {
    const f = vi.fn().mockResolvedValue(reply({ error: { message: 'unauthorized' } }, 401));
    await expect(chat({ apiKey: 'k', model: DEFAULT_MODEL, history: [], context: null, fetchImpl: f })).rejects.toThrow('Google no aceptó tu clave');
    expect(f).toHaveBeenCalledTimes(1);
    // Google responde 400 (en una lista) cuando la clave no es válida.
    const g = vi.fn().mockResolvedValue(reply([{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }], 400));
    await expect(testConnection('k', DEFAULT_MODEL, g)).rejects.toThrow('Google no aceptó tu clave');
    const h = vi.fn().mockResolvedValue(reply({ error: { message: 'quota' } }, 429));
    await expect(chat({ apiKey: 'k', model: FALLBACK_MODEL, history: [], context: null, fetchImpl: h })).rejects.toThrow('llegó a su límite de uso');
    expect(h).toHaveBeenCalledTimes(1);
    const net = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(testConnection('k', DEFAULT_MODEL, net)).rejects.toThrow('No se pudo conectar con Gemini');
    const nf = vi.fn().mockResolvedValue(reply({}, 404));
    await expect(testConnection('k', 'gemini-3.6-flash', nf)).rejects.toThrow('Ese modelo no está disponible');
    expect(bodyOf(nf)).toEqual({ model: 'gemini-3.6-flash', messages: [{ role: 'user', content: 'Responde solo: ok' }], max_tokens: 16 });
  });
});

describe('Asistente: acciones propuestas', () => {
  const data = {
    dayLog: { dateKey: '2026-09-25', water: 3, waterGoal: 8 },
    journal: [{ id: 'j1', date: '2026-09-25', mood: '🙂', gratitude: '', note: 'Mañana tranquila' }],
  } as unknown as LegacyData;

  it('prepara elementos válidos para el servidor sin escribir nada', () => {
    const todo = planTool(call('add_todo', { title: ' Comprar pan ' }), data, ids);
    expect(todo).toMatchObject({ title: 'Añadir pendiente', where: 'Pendientes', plan: { kind: 'add', key: 'todos', item: { title: 'Comprar pan', done: false } } });
    const task = planTool(call('add_task', { title: 'Llamar', pri: 'urgente', time: '9:05' }), data, ids);
    expect(task.plan).toMatchObject({ kind: 'add', key: 'tasks', item: { title: 'Llamar', pri: 'media', time: '09:05', rem: true, done: false, tags: '' } });
    const tx = planTool(call('add_transaction', { amount: -12.345, type: 'expense', category: 'Comida' }), data, ids);
    expect(tx.plan).toMatchObject({ kind: 'add', key: 'transactions', item: { amount: 12.35, type: 'expense', category: 'Comida', date: '2026-09-25', note: '' } });
    const goal = planTool(call('add_goal', { title: 'Leer', target: '12', unit: 'libros', deadline: 'pronto' }), data, ids);
    expect(goal.plan).toMatchObject({ kind: 'add', key: 'goals', item: { target: 12, current: 0, unit: 'libros', deadline: '', category: 'personal', done: false } });
    const routine = planTool(call('add_routine', { title: 'Vitaminas', time: '8:00', days: '531' }), data, ids);
    expect(routine.plan).toMatchObject({ kind: 'add', key: 'routines', item: { time: '08:00', days: '135', icon: 'bell', sound: true, enabled: true } });
    expect(routine.fields).toContainEqual({ label: 'Días', value: 'lunes, miércoles, viernes' });
    for (const p of [todo, task, tx, goal, routine]) {
      if (p.plan?.kind !== 'add') throw new Error('sin plan');
      expect(legacyItemSchemas[p.plan.key].safeParse(p.plan.item).success).toBe(true);
    }
  });

  it('agua, sueño, entreno y diario', () => {
    expect(planTool(call('log_water', { glasses: 2 }), data, ids)).toMatchObject({ plan: { kind: 'water', glasses: 2, today: '2026-09-25' }, fields: [{ label: 'Vasos', value: '+2' }, { label: 'Total de hoy', value: '5' }] });
    expect(planTool(call('log_sleep', { bedtime: '23:30', waketime: '7:00' }), data, ids)).toMatchObject({ plan: { item: { bedtime: '23:30', waketime: '07:00', quality: 3 } }, fields: [{ value: '23:30 → 07:00' }, { value: '7 h 30 min' }, { value: '3 de 5' }] });
    expect(planTool(call('log_workout', { plan: 'Correr' }), data, ids)).toMatchObject({ plan: null, error: 'Falta cuántos minutos duró.' });
    // Ya hay una entrada de hoy: se añade a ella en vez de crear otra.
    expect(planTool(call('add_journal', { note: 'Tarde de estudio', gratitude: 'mi hermana' }), data, ids)).toMatchObject({
      title: 'Añadir al diario de hoy',
      plan: { kind: 'update', key: 'journal', id: 'j1', patch: { note: 'Mañana tranquila\n\nTarde de estudio', gratitude: 'mi hermana' } },
    });
  });

  it('datos incompletos, JSON roto o herramientas desconocidas no se pueden hacer', () => {
    expect(planTool(call('add_todo', {}), data, ids)).toMatchObject({ plan: null, error: 'Falta el título del pendiente.' });
    expect(planTool(call('add_idea', '{roto'), data, ids)).toMatchObject({ plan: null, error: 'Los datos de la acción no se pudieron leer.' });
    expect(planTool(call('delete_everything', {}), data, ids)).toMatchObject({ plan: null, error: expect.stringContaining('delete_everything') });
    expect(planTool(call('add_task', { title: 'x'.repeat(500) }), data, ids)).toMatchObject({ plan: null });
  });
});

describe('Asistente: datos y clave', () => {
  it('el resumen de datos es compacto y nunca incluye bóveda, notas ni el texto del diario', () => {
    const data = {
      todos: [{ id: 't1', title: 'Pagar la luz', done: false }, { id: 't2', title: 'Hecho ya', done: true }],
      goals: [{ id: 'g1', title: 'Leer 12 libros', target: 12, current: 3, unit: 'libros', deadline: '', category: 'estudio', done: false }],
      journal: [{ id: 'j1', date: '2026-09-25', mood: '', gratitude: 'secreto de gratitud', note: 'texto privado del diario' }],
      notes: [{ id: 'n1', title: 'Apuntes privados', body: 'cuerpo de la nota' }],
      vault: [{ id: 'v1', name: 'Banco', user: 'ana', pass: 'Clave-Plana' }],
      vaultSecure: { v: 1, items: [] },
    } as unknown as LegacyData;
    const text = buildContext(data, undefined, new Date('2026-09-25T12:00:00Z'));
    expect(text).toContain('Hoy es viernes 2026-09-25.');
    expect(text).toContain('Pendientes por hacer (1): Pagar la luz.');
    expect(text).toContain('Leer 12 libros (3 de 12 libros)');
    expect(text).toContain('Diario de hoy: ya escrito.');
    for (const secret of ['Hecho ya', 'secreto de gratitud', 'texto privado', 'Apuntes privados', 'cuerpo de la nota', 'Banco', 'Clave-Plana']) expect(text).not.toContain(secret);
  });

  it('la clave solo vive en localStorage de este navegador y «Quitar» la borra', () => {
    expect(loadSettings()).toEqual({ apiKey: '', model: DEFAULT_MODEL, seenPrivacy: false });
    expect(saveSettings({ apiKey: 'k-123', model: 'gemini-pro-latest', seenPrivacy: true })).toBe(true);
    expect(JSON.parse(localStorage.getItem(ASSISTANT_STORAGE_KEY) as string)).toEqual({ apiKey: 'k-123', model: 'gemini-pro-latest', seenPrivacy: true });
    localStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify({ apiKey: 'k', model: 'gpt-4o' }));
    expect(loadSettings().model).toBe(DEFAULT_MODEL);
    clearSettings();
    expect(localStorage.getItem(ASSISTANT_STORAGE_KEY)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { buildRequest, chatAttachmentRefs, chatCards, chatTitle, storedChat, withAttachmentData, type ChatMessage } from '../src/assistant.js';
import { attachmentKind, attachmentProblem, formatBytes, userContent } from '../src/attachments.js';
import { legacyItemSchemas, legacyPatchSchemas, type LegacyData } from '../src/legacy.js';
import { describeKey, planSuggestion, suggest, suggestContext, suggestRequest } from '../src/suggest.js';
import { ventureItemName, ventureItemsOf, ventureSummary } from '../src/tools.js';

let n = 0;
const newId = () => `n${++n}`;
const call = (args: Record<string, unknown>, id = 'c1') => ({ id, type: 'function' as const, function: { name: 'suggest_change', arguments: JSON.stringify(args) } });

describe('adjuntos del Asistente', () => {
  it('reconoce imágenes, PDF y texto, y rechaza lo que no se puede leer', () => {
    expect(attachmentKind('foto.jpg', 'image/jpeg')).toBe('image');
    expect(attachmentKind('doc.pdf', '')).toBe('pdf');
    expect(attachmentKind('notas.md', '')).toBe('text');
    expect(attachmentKind('datos.csv', 'text/csv')).toBe('text');
    expect(attachmentKind('informe.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeNull();
    expect(attachmentProblem({ name: 'informe.docx', mime: '', size: 10 }, 0)).toMatch(/no se puede leer/);
    expect(attachmentProblem({ name: 'a.pdf', mime: 'application/pdf', size: 5 * 1024 * 1024 }, 0)).toMatch(/máximo es 3 MB/);
    expect(attachmentProblem({ name: 'a.png', mime: 'image/png', size: 10 }, 4)).toMatch(/hasta 4/);
    expect(formatBytes(2_500_000)).toBe('2,4 MB');
  });

  it('envía imágenes como image_url y el texto de los archivos como texto', () => {
    const parts = userContent('¿Qué ves?', [
      { name: 'a.png', mime: 'image/png', kind: 'image', size: 3, ref: 'ai_1', data: 'data:image/png;base64,AAA' },
      { name: 'b.txt', mime: 'text/plain', kind: 'text', size: 3, ref: '', text: 'hola' },
      { name: 'c.pdf', mime: 'application/pdf', kind: 'pdf', size: 3, ref: 'ai_2' },
    ]);
    expect(parts).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      { type: 'text', text: 'Archivo adjunto «b.txt»:\n\nhola' },
      { type: 'text', text: '[Adjunto «c.pdf»: ya no está disponible en esta conversación]' },
      { type: 'text', text: '¿Qué ves?' },
    ]);
    expect(userContent('solo texto', undefined)).toBe('solo texto');
    const req = buildRequest('m', [{ role: 'user', content: 'mira', attachments: [{ name: 'a.png', mime: 'image/png', kind: 'image', size: 3, ref: '', data: 'data:image/png;base64,A' }] }], null);
    // Nunca se envía el campo `attachments` tal cual a Google.
    expect(JSON.stringify(req.messages[1])).not.toContain('attachments');
  });
});

describe('historial del Asistente', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: '', attachments: [{ name: 'factura.png', mime: 'image/png', kind: 'image', size: 9, ref: 'ai_x', data: 'data:image/png;base64,ZZ' }] },
    { role: 'assistant', content: 'Te propongo esto', tool_calls: [{ id: 't1', type: 'function', function: { name: 'add_todo', arguments: '{"title":"Pagar"}' } }] },
  ];

  it('guarda la conversación sin las data: URL y válida para el servidor', () => {
    const chat = storedChat('ch1', 'gemini-flash-latest', messages, {
      t1: { callId: 't1', tool: 'add_todo', title: 'Añadir pendiente', where: 'Pendientes', fields: [], plan: { kind: 'add', key: 'todos', item: { id: 'x', title: 'Pagar', done: false } }, done: 'ok', status: 'running' },
    });
    expect(chat.title).toBe('factura.png');
    expect(JSON.stringify(chat)).not.toContain('base64');
    expect(chat.cards.t1.status).toBe('pending');
    expect(legacyItemSchemas.chats.safeParse(chat).success).toBe(true);
    expect(legacyPatchSchemas.chats.safeParse({ messages: chat.messages, cards: chat.cards, title: chat.title }).success).toBe(true);

    // Al reabrirla: los adjuntos se vuelven a descargar y las acciones raras quedan sin «Hacer».
    expect(chatAttachmentRefs(chat.messages)).toEqual(['ai_x']);
    const back = withAttachmentData(chat.messages, { ai_x: 'data:image/png;base64,ZZ' });
    expect((back[0] as Extract<ChatMessage, { role: 'user' }>).attachments?.[0].data).toBe('data:image/png;base64,ZZ');
    const cards = chatCards({ cards: { ...chat.cards, t2: { ...chat.cards.t1, callId: 't2', plan: { kind: 'nada' } } } });
    expect(cards.t1.plan).toMatchObject({ kind: 'add', key: 'todos' });
    expect(cards.t2.status).toBe('invalid');
  });

  it('titula con el primer mensaje, recortado', () => {
    expect(chatTitle([{ role: 'user', content: 'a'.repeat(80) }])).toHaveLength(60);
    expect(chatTitle([])).toBe('Conversación');
  });
});

describe('Emprendimientos', () => {
  it('valida emprendimientos y lo que guardan', () => {
    expect(legacyItemSchemas.ventures.parse({ id: 'v1', name: 'Café' })).toMatchObject({ stage: 'idea', description: '' });
    expect(legacyItemSchemas.ventureItems.safeParse({ id: 'i1', ventureId: 'v1', kind: 'link', url: 'javascript:alert(1)' }).success).toBe(false);
    expect(legacyItemSchemas.ventureItems.safeParse({ id: 'i1', ventureId: 'v1', kind: 'file', ref: '../x' }).success).toBe(false);
    const data = {
      ventureItems: [
        { id: 'a', ventureId: 'v1', kind: 'note', title: 'Plan', text: '', url: '', ref: '', mime: '', size: 0, date: '' },
        { id: 'b', ventureId: 'v1', kind: 'image', title: '', text: '', url: '', ref: 'vf_1', mime: 'image/jpeg', size: 9, date: '' },
        { id: 'c', ventureId: 'v2', kind: 'link', title: '', text: '', url: 'https://www.ejemplo.com/a', ref: '', mime: '', size: 0, date: '' },
      ],
    } as unknown as LegacyData;
    expect(ventureItemsOf(data, 'v1').map((i) => i.id)).toEqual(['b', 'a']);
    expect(ventureSummary(ventureItemsOf(data, 'v1'))).toBe('1 nota · 1 imagen');
    expect(ventureItemName(ventureItemsOf(data, 'v2')[0])).toBe('ejemplo.com/a');
  });
});

describe('sugerencias de las secciones', () => {
  const data = {
    todos: [{ id: 't1', title: 'Estudiar física', done: false }],
    journal: [{ id: 'j', date: '2026-10-30', mood: 'bien', gratitude: 'secreto', note: 'muy privado' }],
    classes: [{ id: 'k1', day: 1, start: '08:00', end: '09:00', title: 'Química', room: '', color: '#4F7CFF', subject: '' }],
  } as unknown as LegacyData;

  it('describe los campos y manda solo los datos de la sección, sin textos privados', () => {
    expect(describeKey('todos')).toContain('title (obligatorio): texto');
    expect(describeKey('blocks')).toContain('horas decimales');
    expect(suggestContext('diario', data)).toContain('"mood":"bien"');
    expect(suggestContext('diario', data)).not.toContain('privado');
    expect(suggestContext('pendientes', data)).not.toContain('Química');
    const req = suggestRequest('m', 'pendientes', data, { avoid: ['Haz algo'] });
    expect(req.tools[0].function.parameters.properties.key.enum).toEqual(['todos', 'subtasks']);
    expect(req.messages[1].content).toContain('«Haz algo»');
    expect(() => suggestRequest('m', 'boveda', data)).toThrow();
  });

  it('crea varios elementos enlazados (un pendiente y sus subtareas) en una sola acción', () => {
    const p = planSuggestion(call({ title: 'Divide', reason: 'Más fácil', action: 'add', key: 'subtasks', fields: JSON.stringify([{ todoId: 't1', title: 'Leer tema 1' }, { todoId: 't1', title: 'Hacer ejercicios', extra: 1 }]) }), 'pendientes', data, { newId });
    expect(p.error).toBeUndefined();
    expect(p.plan).toMatchObject({ kind: 'batch', ops: [{ kind: 'add', key: 'subtasks', item: { todoId: 't1', title: 'Leer tema 1', done: false } }, { item: { title: 'Hacer ejercicios' } }] });
    expect(JSON.stringify(p.plan)).not.toContain('extra');
    expect(p.fields).toEqual([
      { label: 'Subtarea', value: 'Leer tema 1' },
      { label: 'Subtarea', value: 'Hacer ejercicios' },
    ]);
  });

  it('enlaza un padre nuevo con sus hijos y rechaza padres que no existen', () => {
    const ok = planSuggestion(call({ title: 'x', reason: '', action: 'add', key: 'todos', fields: [{ id: 'nuevo', title: 'Viaje' }] }), 'pendientes', data, { newId });
    expect(ok.plan).toMatchObject({ kind: 'add', key: 'todos', item: { title: 'Viaje' } });
    const bad = planSuggestion(call({ title: 'x', reason: '', action: 'add', key: 'subtasks', fields: { todoId: 'nope', title: 'a' } }), 'pendientes', data, { newId });
    expect(bad.plan).toBeNull();
    expect(bad.error).toBe('La tarea principal no existe');
  });

  it('cambia un elemento existente con un parche válido y comprueba las horas', () => {
    const p = planSuggestion(call({ title: 'Pon el aula', reason: 'r', action: 'update', key: 'classes', id: 'k1', fields: '{"room":"B-12","id":"otro"}' }), 'horario', data, { newId });
    expect(p.plan).toEqual({ kind: 'update', key: 'classes', id: 'k1', patch: { room: 'B-12' } });
    expect(p.where).toBe('Clase: Química');
    const late = planSuggestion(call({ title: 'x', reason: '', action: 'update', key: 'classes', id: 'k1', fields: { end: '07:00' } }), 'horario', data, { newId });
    expect(late.error).toMatch(/fin debe ser posterior/);
    expect(planSuggestion(call({ title: 'x', reason: '', action: 'update', key: 'classes', id: 'no', fields: { room: 'a' } }), 'horario', data, { newId }).error).toMatch(/no existe/);
    expect(planSuggestion(call({ title: 'x', reason: '', action: 'add', key: 'goals', fields: { title: 'a' } }), 'horario', data, { newId }).error).toMatch(/otra sección/);
  });

  it('pide las sugerencias a Gemini y descarta las que no sirven', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Aquí van dos ideas.',
                tool_calls: [
                  { id: 'a', function: { name: 'suggest_change', arguments: JSON.stringify({ title: 'Añade leer', reason: 'r', action: 'add', key: 'todos', fields: { title: 'Leer 20 min' } }) } },
                  { id: 'b', function: { name: 'suggest_change', arguments: JSON.stringify({ title: 'Mal', reason: 'r', action: 'add', key: 'todos', fields: { title: '' } }) } },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    const r = await suggest({ apiKey: 'k', model: 'gemini-flash-latest', tool: 'pendientes', data, newId, fetchImpl });
    expect(r.intro).toBe('Aquí van dos ideas.');
    expect(r.proposals.map((p) => p.title)).toEqual(['Añade leer']);
    expect(r.dropped).toBe(1);
  });
});

/**
 * Asistente de la versión de prueba: no se conecta a Gemini ni a ningún otro
 * servicio. Responde con ejemplos a partir de lo que escribes y, si pides
 * añadir un pendiente o anotar agua, propone la acción igual que el de verdad
 * (se hace solo al pulsar «Hacer»).
 */

type Msg = { role: string; content?: string | null | Array<{ type: string; text?: string }>; tool_calls?: unknown };

/** Texto de un mensaje (con adjuntos, el contenido es una lista de partes). */
const textOf = (c: Msg['content']) => (Array.isArray(c) ? (c.filter((p) => p.type === 'text').pop()?.text ?? '') : String(c ?? ''));
const hasImage = (c: Msg['content']) => Array.isArray(c) && c.some((p) => p.type === 'image_url');

const NOTE = '_Versión de prueba: aquí el asistente no usa inteligencia artificial y responde con un ejemplo. En la app real, Gemini contestaría a lo que escribas con tu clave._';

let calls = 0;

function toolCall(name: string, args: Record<string, unknown>) {
  calls += 1;
  return { id: `prueba_${calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

/** Qué contestaría el asistente al último mensaje (texto y, a veces, una acción propuesta). */
export function demoAssistantReply(messages: Msg[]): { content: string; tool_calls?: unknown[] } {
  const last = messages[messages.length - 1];
  if (!last) return { content: NOTE };
  if (last.role === 'tool') return { content: `Hecho: ya está guardado en tus datos de prueba. ¿Te ayudo con algo más?\n\n${NOTE}` };
  const text = textOf(last.content).trim();
  if (/^responde solo: ok$/i.test(text)) return { content: 'ok' };
  if (Array.isArray(last.content))
    return {
      content: `${hasImage(last.content) ? 'Recibí tu imagen.' : 'Recibí tu archivo.'} En la app real, Gemini la leería y te respondería sobre su contenido (por ejemplo, pasar una foto de tu horario a la Agenda o resumir un PDF).\n\n${NOTE}`,
    };

  const todo = text.match(/(?:añade|agrega|apunta|anota|pon)\s+(?:«([^»]+)»|"([^"]+)"|“([^”]+)”|(.+?))\s+(?:a|en)\s+(?:mis\s+|los\s+)?pendientes/i);
  if (todo) {
    const title = (todo[1] ?? todo[2] ?? todo[3] ?? todo[4] ?? '').trim().replace(/[.!]+$/, '');
    const pretty = title.charAt(0).toUpperCase() + title.slice(1);
    return { content: `Claro, te propongo añadirlo a tus pendientes:\n\n${NOTE}`, tool_calls: [toolCall('add_todo', { title: pretty })] };
  }
  const water = text.match(/(\d+|un|una|dos|tres|cuatro|cinco)\s+vasos?\s+de\s+agua/i);
  if (water) {
    const words: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
    const n = Number(water[1]) || words[water[1].toLowerCase()] || 1;
    return { content: `¡Bien hecho! Te propongo sumarlos al registro de agua de hoy:\n\n${NOTE}`, tool_calls: [toolCall('log_water', { glasses: n })] };
  }
  if (/plan|organiz|tarde|estudi/i.test(text)) {
    return {
      content: [
        'Te propongo una tarde de estudio en bloques cortos:',
        '',
        '1. **16:00–16:25** · Integrales por partes (sin móvil).',
        '2. **16:25–16:30** · Pausa: agua y estirar.',
        '3. **16:30–16:55** · Ejercicios del tema de ondas.',
        '4. **17:00–17:15** · Repaso rápido y apunta dudas.',
        '',
        'Si quieres, usa **Enfoque** para cronometrar cada bloque.',
        '',
        NOTE,
      ].join('\n'),
    };
  }
  return {
    content: [
      'Puedo ayudarte a organizar tu día, resumir tus pendientes o proponer acciones como añadir un pendiente, anotar agua o registrar un entreno.',
      '',
      'Prueba, por ejemplo: «Añade comprar pan a mis pendientes» o «Anota 2 vasos de agua».',
      '',
      NOTE,
    ].join('\n'),
  };
}

/** Ejemplos de sugerencias por clave (versión de prueba). */
const DEMO_SUGGESTIONS: Record<string, Array<{ title: string; reason: string; fields: unknown }>> = {
  todos: [
    { title: 'Añade «Preparar la mochila de mañana»', reason: 'Dejarlo listo la noche anterior te ahorra prisas por la mañana.', fields: { title: 'Preparar la mochila de mañana' } },
    { title: 'Añade «Repasar apuntes 20 min»', reason: 'Un repaso corto cada día rinde más que una sesión larga antes del examen.', fields: { title: 'Repasar apuntes 20 min' } },
  ],
  tasks: [{ title: 'Añade una tarea de planificación semanal', reason: 'Reservar 15 minutos para planear la semana evita olvidos.', fields: { title: 'Planear la semana', pri: 'alta', time: '18:00' } }],
  courses: [{ title: 'Añade un curso de inglés en YouTube', reason: 'Tener el enlace a mano hace más fácil empezar.', fields: { topic: 'Inglés', title: 'Inglés desde cero', url: 'https://www.youtube.com/results?search_query=ingles+desde+cero' } }],
  goals: [{ title: 'Crea la meta «Leer 12 libros»', reason: 'Una meta medible con unidad es más fácil de seguir.', fields: { title: 'Leer 12 libros', target: 12, unit: 'libros', category: 'personal' } }],
  routines: [{ title: 'Añade «Apagar pantallas» a las 22:30', reason: 'Dejar las pantallas antes de dormir ayuda a conciliar el sueño.', fields: { title: 'Apagar pantallas', time: '22:30', days: '1234567' } }],
  ideas: [{ title: 'Guarda la idea «Boletín semanal»', reason: 'Un boletín te ayuda a mantener contacto con tu público.', fields: { title: 'Boletín semanal', body: 'Un correo cada viernes con lo mejor de la semana.', category: 'marketing' } }],
  ventures: [{ title: 'Crea el emprendimiento «Tienda en línea»', reason: 'Tener un espacio para cada negocio te ayuda a no mezclar ideas.', fields: { name: 'Tienda en línea', description: 'Vender productos hechos a mano por Instagram.', stage: 'idea' } }],
};

function demoSuggestions(keys: string[]) {
  const calls = keys.flatMap((key) => (DEMO_SUGGESTIONS[key] ?? []).map((s) => toolCall('suggest_change', { ...s, action: 'add', key, fields: JSON.stringify(s.fields) }))).slice(0, 3);
  return {
    content: calls.length ? `Estas son algunas ideas de ejemplo. ${NOTE}` : `En la versión de prueba no hay sugerencias de ejemplo para esta sección. ${NOTE}`,
    ...(calls.length ? { tool_calls: calls } : {}),
  };
}

/** `fetch` para lib/assistant.ts: contesta como la API de Gemini (compatible con OpenAI), sin red. */
export async function demoAssistantFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let messages: Msg[] = [];
  let suggestKeys: string[] | null = null;
  try {
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Msg[]; tools?: Array<{ function?: { name?: string; parameters?: { properties?: { key?: { enum?: string[] } } } } }> };
    messages = Array.isArray(body.messages) ? body.messages : [];
    const fn = body.tools?.[0]?.function;
    if (fn?.name === 'suggest_change') suggestKeys = fn.parameters?.properties?.key?.enum ?? [];
  } catch {
    /* sin cuerpo: respuesta genérica */
  }
  await new Promise((r) => setTimeout(r, 600));
  const message = { role: 'assistant', ...(suggestKeys ? demoSuggestions(suggestKeys) : demoAssistantReply(messages)) };
  return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Asistente de la versión de prueba: no se conecta a Gemini ni a ningún otro
 * servicio. Responde con ejemplos a partir de lo que escribes y, si pides
 * añadir un pendiente o anotar agua, propone la acción igual que el de verdad
 * (se hace solo al pulsar «Hacer»).
 */

type Msg = { role: string; content?: string | null; tool_calls?: unknown };

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
  const text = String(last.content ?? '').trim();
  if (/^responde solo: ok$/i.test(text)) return { content: 'ok' };

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

/** `fetch` para lib/assistant.ts: contesta como la API de Gemini (compatible con OpenAI), sin red. */
export async function demoAssistantFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let messages: Msg[] = [];
  try {
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Msg[] };
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    /* sin cuerpo: respuesta genérica */
  }
  await new Promise((r) => setTimeout(r, 600));
  const message = { role: 'assistant', ...demoAssistantReply(messages) };
  return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

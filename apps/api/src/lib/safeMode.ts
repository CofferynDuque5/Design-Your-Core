import { createServer } from 'node:http';

// Si la API no puede arrancar (configuración incompleta, cliente de Prisma sin generar…),
// en vez de caerse —en cPanel eso es un «503 Service Unavailable» sin pistas— se queda
// respondiendo con el motivo: /api/health lo muestra y el login de la web también.

/** Traduce el error de arranque a un mensaje que diga qué hacer. Nunca incluye contraseñas. */
export function startupProblem(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/JWT_SECRET/.test(raw)) {
    return 'Falta JWT_SECRET o es muy corto: debe tener al menos 32 caracteres. Ponlo en las variables de la app en «Setup Node.js App» y pulsa Restart.';
  }
  if (/did not initialize yet|prisma generate|export 'PrismaClient'|\.prisma\/client/i.test(raw)) {
    return 'Falta preparar la base de datos: en «Setup Node.js App» pulsa «Run NPM Install» y después Restart.';
  }
  if (/Cannot find (module|package)/i.test(raw)) {
    return 'Faltan dependencias: en «Setup Node.js App» pulsa «Run NPM Install» y después Restart.';
  }
  const firstLine = raw.split('\n').find((l) => l.trim()) ?? 'error desconocido';
  return `Error al arrancar: ${firstLine.replace(/\/\/[^/@\s]*@/g, '//***@').slice(0, 200)}`;
}

export function startSafeMode(port: number | string, problem: string) {
  const body = JSON.stringify({ ok: false, error: `La API no pudo arrancar. ${problem}` });
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design Your Core · API detenida</title><body style="font-family:system-ui,sans-serif;background:#0A0B09;color:#EEF0E8;max-width:36rem;margin:10vh auto;padding:0 16px;line-height:1.5"><h1 style="font-weight:500">La API no pudo arrancar</h1><p>${problem.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string)}</p></body></html>`;
  return createServer((req, res) => {
    const api = (req.url ?? '').startsWith('/api');
    res.writeHead(503, { 'Content-Type': api ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(api ? body : html);
  }).listen(port, () => console.error(`[core-cloud] modo seguro en ${port}: ${problem}`));
}

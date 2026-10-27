import { createServer } from 'node:http';

// Si la API no puede arrancar (configuración incompleta, archivos a medio subir…),
// en vez de caerse —en cPanel eso es un «503 Service Unavailable» sin pistas— se queda
// respondiendo con el motivo: /api/health lo muestra y el login de la web también.

/** Traduce el error de arranque a un mensaje que diga qué hacer. Nunca incluye contraseñas. */
export function startupProblem(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/JWT_SECRET/.test(raw)) {
    return 'Falta JWT_SECRET o es muy corto: debe tener al menos 32 caracteres. Ponlo en las variables de la app en «Setup Node.js App» y pulsa Restart.';
  }
  if (/DATABASE_URL|Invalid URL/i.test(raw)) {
    return 'Falta DATABASE_URL o no es válida. Pega tu cadena de Neon (postgresql://…) en las variables de la app en «Setup Node.js App» y pulsa Restart.';
  }
  if (/Cannot find (module|package)/i.test(raw)) {
    return 'Faltan archivos de la API. Vuelve a extraer el ZIP en tu carpeta de inicio (debe quedar core-api/dist/server.mjs) y pulsa Restart.';
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

/**
 * Si el error es de conexión con la base de datos, explica qué revisar; si es
 * otro tipo de error, devuelve null. Nunca incluye la contraseña.
 */
export function databaseProblem(error: unknown): string | null {
  const e = (error ?? {}) as { code?: string; message?: string };
  const msg = String(e.message ?? '');
  switch (e.code) {
    case '28P01':
    case '28000':
      return 'La base de datos rechazó el usuario o la contraseña de DATABASE_URL. Copia de nuevo la cadena de conexión desde Neon.';
    case '3D000':
      return 'La base de datos que indica DATABASE_URL no existe. Revisa el nombre al final de la cadena de Neon.';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'No se encuentra el servidor de la base de datos. Revisa el host de DATABASE_URL (la parte después de la @).';
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ECONNRESET':
    case 'EHOSTUNREACH':
      return 'No se pudo conectar con la base de datos. Revisa DATABASE_URL; si es correcta, el hosting puede estar bloqueando la salida al puerto 5432.';
  }
  if (/timeout exceeded when trying to connect|Connection terminated/i.test(msg)) {
    return 'La base de datos no respondió a tiempo. Revisa DATABASE_URL y vuelve a intentarlo en un momento.';
  }
  if (/SSL|certificate|self[- ]signed/i.test(msg)) return 'Falló la conexión segura con la base de datos. Asegúrate de que DATABASE_URL termine en ?sslmode=require.';
  if (/password authentication failed|no pg_hba\.conf entry/i.test(msg)) {
    return 'La base de datos rechazó el usuario o la contraseña de DATABASE_URL. Copia de nuevo la cadena de conexión desde Neon.';
  }
  return null;
}

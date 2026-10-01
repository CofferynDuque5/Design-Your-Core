// Punto de entrada: carga la API (server.ts) y, si no puede arrancar —falta JWT_SECRET,
// el cliente de Prisma sin generar, dependencias sin instalar—, en vez de caerse (en cPanel
// eso es un «503 Service Unavailable» sin pistas) se queda respondiendo con el motivo.
// Por eso aquí solo se importa lo que trae Node. Sin «await» de nivel superior: en el
// paquete de cPanel este archivo es CommonJS (ver scripts/bundle.mjs), porque el servidor
// de Node del hosting lo carga con require().
import { startSafeMode, startupProblem } from './lib/safeMode.js';

import('./server.js').catch((e: unknown) => {
  console.error('[core-cloud] no pudo arrancar:', e);
  startSafeMode(process.env.PORT || 4600, startupProblem(e));
});

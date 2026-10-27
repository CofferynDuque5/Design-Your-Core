// Arranque de la API. Lo carga index.ts, que muestra el motivo si algo aquí falla.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { isPlaceholderDatabaseUrl, loadConfig, loadEnvFiles } from './config.js';
import { createDb } from './db/db.js';
import { migrate } from './db/migrate.js';
import { createMailer } from './lib/mailer.js';
import { databaseProblem } from './lib/safeMode.js';

loadEnvFiles();
const config = loadConfig();

// Sin base de datos no hay nada que servir: el modo seguro (index.ts) explica qué falta.
if (isPlaceholderDatabaseUrl(config.databaseUrl)) throw new Error('Falta DATABASE_URL o sigue el valor de ejemplo');

const db = createDb(config.databaseUrl);
// Las pruebas de punta a punta crean muchas cuentas desde la misma IP: con
// NODE_ENV=test los límites de peticiones se relajan. Nunca en producción.
const limits = process.env.NODE_ENV === 'test' ? { general: 10_000, strict: 1_000 } : undefined;
// Paquete de cPanel: si la app web viene en public/ (junto a dist/), se sirve desde aquí
// y web y API comparten dominio.
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const serveWeb = existsSync(join(webRoot, 'index.html'));
const app = createApp({ db, config, mailer: createMailer(config.smtp), limits, webRoot: serveWeb ? webRoot : undefined });

// No dejar caer el proceso por un rechazo/excepción no controlados.
process.on('unhandledRejection', (r) => console.error('[core-cloud] unhandledRejection:', r));
process.on('uncaughtException', (e) => console.error('[core-cloud] uncaughtException:', e));

// Crea o actualiza las tablas (migrations/*.sql) antes de aceptar peticiones. Si la base
// no responde, la API arranca igual (/api/health dice qué falla) y lo reintenta cada minuto.
async function migrateOrRetry(): Promise<void> {
  try {
    await migrate(db);
  } catch (e) {
    console.error('[core-cloud] error de migración:', databaseProblem(e) ?? (e instanceof Error ? e.message : e));
    setTimeout(() => void migrateOrRetry(), 60_000).unref();
  }
}
await migrateOrRetry();

const server = app.listen(config.port, () => console.log(`[core-cloud] listening on ${config.port}${serveWeb ? ' (con la app web)' : ''}`));

// Apagado limpio (cierra las conexiones a la base).
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
  });
}

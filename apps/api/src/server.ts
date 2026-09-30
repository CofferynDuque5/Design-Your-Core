// Arranque de la API. Lo carga index.ts, que muestra el motivo si algo aquí falla.
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { isPlaceholderDatabaseUrl, loadConfig, loadEnvFiles } from './config.js';
import { migrate } from './db/migrate.js';
import { createMailer } from './lib/mailer.js';

loadEnvFiles();
const config = loadConfig();
// Prisma lee DATABASE_URL del entorno: se le pasa ya normalizada.
process.env.DATABASE_URL = config.databaseUrl;

// Aviso claro si falta la base de datos o quedó el valor de ejemplo.
if (isPlaceholderDatabaseUrl(config.databaseUrl)) {
  console.error('[core-cloud] FALTA CONFIGURAR DATABASE_URL: abre core-config.env y pega tu cadena real de Neon.');
}

const prisma = new PrismaClient();
// Las pruebas de punta a punta crean muchas cuentas desde la misma IP: con
// NODE_ENV=test los límites de peticiones se relajan. Nunca en producción.
const limits = process.env.NODE_ENV === 'test' ? { general: 10_000, strict: 1_000 } : undefined;
// Paquete de cPanel: si la app web viene en public/ (junto a dist/), se sirve desde aquí
// y web y API comparten dominio.
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const serveWeb = existsSync(join(webRoot, 'index.html'));
const app = createApp({ prisma, config, mailer: createMailer(config.smtp), limits, webRoot: serveWeb ? webRoot : undefined });

// No dejar caer el proceso por un rechazo/excepción no controlados.
process.on('unhandledRejection', (r) => console.error('[core-cloud] unhandledRejection:', r));
process.on('uncaughtException', (e) => console.error('[core-cloud] uncaughtException:', e));

// Crea o actualiza las tablas (migrations/*.sql) antes de aceptar peticiones.
await migrate(prisma).catch((e) => console.error('[core-cloud] error de migración:', e instanceof Error ? e.message : e));

const server = app.listen(config.port, () => console.log(`[core-cloud] listening on ${config.port}${serveWeb ? ' (con la app web)' : ''}`));

// Apagado limpio (cierra conexiones de Prisma).
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close(() => {
      prisma.$disconnect().finally(() => process.exit(0));
    });
  });
}

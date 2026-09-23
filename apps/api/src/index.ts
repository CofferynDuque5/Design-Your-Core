import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { isPlaceholderDatabaseUrl, loadConfig, loadEnvFiles } from './config.js';
import { ensureSchema } from './db/ensureSchema.js';
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
const app = createApp({ prisma, config, mailer: createMailer(config.smtp) });

// No dejar caer el proceso por un rechazo/excepción no controlados.
process.on('unhandledRejection', (r) => console.error('[core-cloud] unhandledRejection:', r));
process.on('uncaughtException', (e) => console.error('[core-cloud] uncaughtException:', e));

await ensureSchema(prisma).catch((e) => console.error('[core-cloud] ensureSchema fallo:', e instanceof Error ? e.message : e));

const server = app.listen(config.port, () => console.log(`[core-cloud] listening on ${config.port}`));

// Apagado limpio (cierra conexiones de Prisma).
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close(() => {
      prisma.$disconnect().finally(() => process.exit(0));
    });
  });
}

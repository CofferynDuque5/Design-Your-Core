import type { PrismaClient } from '@prisma/client';
import cors, { type CorsOptions } from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createAuth } from './auth.js';
import type { Config } from './config.js';
import type { Mailer } from './lib/mailer.js';
import { isLocalOrigin, isTrustedOrigin } from './lib/origins.js';
import { authRoutes } from './routes/auth.js';
import { imageRoutes } from './routes/images.js';
import { partnerRoutes } from './routes/partner.js';
import { resetRoutes } from './routes/reset.js';
import { syncRoutes } from './routes/sync.js';
import { v2Routes } from './v2/index.js';

export interface AppDeps {
  prisma: PrismaClient;
  config: Config;
  mailer: Mailer;
  /** Límites por ventana de 15 min. Solo se cambian en pruebas. */
  limits?: { general: number; strict: number };
}

export function createApp({ prisma, config, mailer, limits = { general: 600, strict: 20 } }: AppDeps) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());

  const corsOrigin: CorsOptions['origin'] = (origin, cb) => {
    // Sin Origin (apps nativas, curl, same-origin) → permitido.
    if (!origin) return cb(null, true);
    if (isTrustedOrigin(origin, config) || isLocalOrigin(origin)) return cb(null, true);
    return cb(null, !config.isProd);
  };
  app.use(cors({ origin: corsOrigin, credentials: false }));
  app.use(express.json({ limit: '8mb' })); // el documento puede llevar imágenes de notas (base64)

  // Rate limiting: un límite general holgado + uno estricto para autenticación
  // y para aceptar códigos de pareja (evita fuerza bruta y adivinación).
  const window = 15 * 60 * 1000;
  const general = rateLimit({ windowMs: window, max: limits.general, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiadas peticiones, espera un momento.' } });
  const strict = rateLimit({ windowMs: window, max: limits.strict, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' } });
  app.use('/api', general);
  // No cachear respuestas de la API (llevan token/datos personales).
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const auth = createAuth(prisma, config.jwtSecret);
  const { requireAuth } = auth;

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'core-cloud' });
  });
  app.use('/api', authRoutes({ prisma, auth, mailer, config, strict }));
  app.use('/api', syncRoutes({ prisma, requireAuth }));
  app.use('/api', imageRoutes({ prisma, requireAuth }));
  app.use('/api', partnerRoutes({ prisma, requireAuth, strict, mailer, config }));
  app.use('/api/v2', v2Routes({ prisma, auth, requireAuth, strict }));
  app.use(resetRoutes({ prisma, strict }));

  // fallback 404 para /api
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
  });

  // Manejador de errores global: registra y responde 500 (sin filtrar detalles).
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[core-cloud] error:', err instanceof Error ? err.message : err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Error interno del servidor' });
  };
  app.use(onError);

  return app;
}

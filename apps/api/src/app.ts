import cors, { type CorsOptions } from 'cors';
import express, { type ErrorRequestHandler, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import { createAuth } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db/db.js';
import type { Mailer } from './lib/mailer.js';
import { isLocalOrigin, isTrustedOrigin } from './lib/origins.js';
import { databaseProblem } from './lib/safeMode.js';
import { authRoutes } from './routes/auth.js';
import { imageRoutes } from './routes/images.js';
import { paymentRoutes } from './routes/payments.js';
import { coupleRoutes } from './routes/couple.js';
import { pushRoutes } from './routes/push.js';
import { partnerRoutes } from './routes/partner.js';
import { resetRoutes } from './routes/reset.js';
import { syncRoutes } from './routes/sync.js';
import { v2Routes } from './v2/index.js';
import { webRoutes } from './routes/web.js';
import { courseLengthRoutes } from './routes/courseLength.js';
import { fetchPublicPage, type FetchPage } from './lib/fetchPage.js';
import { copyStatus } from './db/copyFrom.js';

export interface AppDeps {
  db: Db;
  config: Config;
  mailer: Mailer;
  /** Límites por ventana de 15 min. Solo se cambian en pruebas. */
  limits?: { general: number; strict: number };
  /** Carpeta con la app web compilada, si se sirve en el mismo dominio que la API. */
  webRoot?: string;
  /** Cómo se descargan páginas de cursos (las pruebas lo cambian). */
  fetchPage?: FetchPage;
}

export function createApp({ db, config, mailer, limits = { general: 5000, strict: 20 }, webRoot, fetchPage = fetchPublicPage }: AppDeps) {
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

  // Rate limiting. Antes se contaba por dirección IP: en el hosting, todos los que
  // salen por la misma red (la casa, el wifi de la universidad, el proxy del
  // hosting) compartían un solo cupo y se bloqueaban entre sí con un uso normal.
  // Ahora:
  // - El límite general se cuenta por cuenta (token) y es muy holgado; sin sesión,
  //   por IP. Solo frena abusos (miles de peticiones), nunca el uso normal.
  // - El límite estricto (contraseñas, códigos de pareja) solo cuenta los intentos
  //   FALLIDOS, y por correo + IP: entrar bien nunca suma.
  const window = 15 * 60 * 1000;
  const who = (req: Request) => {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) {
      try {
        const p = jwt.verify(h.slice(7), config.jwtSecret, { algorithms: ['HS256'] }) as { sub?: string };
        if (p.sub) return `u:${p.sub}`;
      } catch {
        // Token viejo o inválido: se cuenta por IP.
      }
    }
    return `ip:${req.ip ?? ''}`;
  };
  const general = rateLimit({
    windowMs: window,
    max: limits.general,
    keyGenerator: who,
    skip: (req) => req.path === '/health',
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones seguidas. Espera un minuto y vuelve a intentarlo.' },
  });
  const strict = rateLimit({
    windowMs: window,
    max: limits.strict,
    skipSuccessfulRequests: true,
    // Lo que manda correos (recuperar contraseña, invitar a la pareja) cuenta siempre,
    // para que nadie pueda llenar de correos el buzón de otra persona.
    requestWasSuccessful: (req, res) => res.statusCode < 400 && !/forgot-password|invite\/email/.test(req.originalUrl),
    keyGenerator: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 200) : '';
      return `${who(req)}|${email}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo, o usa «¿Olvidaste tu contraseña?».' },
  });
  app.use('/api', general);
  // No cachear respuestas de la API (llevan token/datos personales).
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const auth = createAuth(db, config.jwtSecret);
  const { requireAuth } = auth;

  // Comprueba también la base de datos: si falla, dice qué revisar.
  app.get('/api/health', async (_req, res) => {
    try {
      await db.row('SELECT 1');
      res.json({ ok: true, service: 'core-cloud', ...(copyStatus.value ? { mudanza: copyStatus.value.detalle } : {}) });
    } catch (e) {
      res.status(503).json({ ok: false, service: 'core-cloud', error: databaseProblem(e) ?? 'La base de datos devolvió un error. Revisa DATABASE_URL.' });
    }
  });
  app.use('/api', authRoutes({ db, auth, mailer, config, strict }));
  app.use('/api', syncRoutes({ db, requireAuth }));
  app.use('/api', imageRoutes({ db, requireAuth }));
  app.use('/api', pushRoutes({ db, requireAuth }));
  app.use('/api', partnerRoutes({ db, requireAuth, strict, mailer, config }));
  app.use('/api/v2', v2Routes({ db, auth, requireAuth, strict }));
  app.use('/api/v2', paymentRoutes({ db, requireAuth, strict, config }));
  app.use('/api/v2', coupleRoutes({ db, requireAuth }));
  // Lee páginas de fuera: límite propio para que no sirva de proxy.
  const lengthLimit = rateLimit({ windowMs: window, max: Math.max(limits.strict * 3, 60), standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiadas consultas de duración. Espera unos minutos.' } });
  app.use('/api/v2', courseLengthRoutes({ requireAuth, limit: lengthLimit, fetchPage }));
  app.use(resetRoutes({ db, strict }));

  // fallback 404 para /api
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
  });

  if (webRoot) app.use(webRoutes(webRoot));

  // Manejador de errores global: registra y responde 500 (sin filtrar detalles).
  // Si no hay conexión con la base de datos lo dice, para saber qué revisar.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[core-cloud] error:', err instanceof Error ? err.message : err);
    if (res.headersSent) return;
    const dbProblem = databaseProblem(err);
    if (dbProblem) return void res.status(503).json({ error: `El servidor no puede usar la base de datos. ${dbProblem}` });
    res.status(500).json({ error: 'Error interno del servidor' });
  };
  app.use(onError);

  return app;
}

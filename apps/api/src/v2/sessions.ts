import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Auth } from '../auth.js';
import { newId, type Db } from '../db/db.js';
import type { RefreshToken, User } from '../db/types.js';
import { ah } from '../lib/http.js';
import { sha256hex } from '../lib/security.js';
import { createUser, findUser, findUserByEmail, publicUser } from '../routes/auth.js';
import { parse } from './util.js';

/**
 * Sesiones renovables para la app móvil.
 *
 * - `accessToken`: JWT de 15 minutos (el mismo formato que v1, así que sirve
 *   en todas las rutas con requireAuth).
 * - `refreshToken`: valor opaco de 90 días. Se guarda solo su hash y rota en
 *   cada renovación. Si llega un token ya rotado, alguien lo copió: se revoca
 *   toda su familia y hay que volver a entrar.
 * - Cambiar la contraseña o "cerrar otras sesiones" (tokenVersion) invalida
 *   también las renovaciones.
 */
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 90 * 86_400_000;

const DUMMY_HASH = bcrypt.hashSync('core-dummy-session-password', 12);

const device = z.string().trim().max(80).optional();
const sessionSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200), device }).strict();
const registerSchema = z
  .object({ email: z.string().email(), password: z.string().min(8).max(200), name: z.string().trim().min(1).max(80).optional(), device })
  .strict();
const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) }).strict();
const deviceSchema = z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web']) }).strict();

interface Deps {
  db: Db;
  auth: Auth;
  requireAuth: RequestHandler;
  strict: RequestHandler;
}

export function sessionRoutes({ db, auth, requireAuth, strict }: Deps): Router {
  const r = Router();

  const revokeFamily = (family: string) =>
    db.exec('UPDATE "RefreshToken" SET "revokedAt" = $2 WHERE "family" = $1 AND "revokedAt" IS NULL', [family, new Date()]);

  async function issue(user: User, family?: string, deviceName?: string | null) {
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    const row = (await db.row<RefreshToken>(
      `INSERT INTO "RefreshToken" ("id", "userId", "tokenHash", "family", "tokenVersion", "deviceName", "expiresAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [newId(), user.id, sha256hex(refreshToken), family ?? crypto.randomUUID(), user.tokenVersion, deviceName ?? null, new Date(Date.now() + REFRESH_TTL_MS), new Date()],
    )) as RefreshToken;
    return {
      row,
      body: {
        accessToken: auth.signToken(user.id, user.tokenVersion, ACCESS_TTL_SECONDS),
        refreshToken,
        expiresIn: ACCESS_TTL_SECONDS,
        user: publicUser(user),
      },
    };
  }

  r.post('/auth/register', strict, ah(async (req, res) => {
    const input = parse(registerSchema, req.body, res);
    if (!input) return;
    const email = input.email.toLowerCase().trim();
    if (await findUserByEmail(db, email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    const user = await createUser(db, {
      email,
      name: input.name || email.split('@')[0],
      passwordHash: await bcrypt.hash(input.password, 12),
      gender: 'otro',
      showCycle: false,
    });
    if (!user) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    res.status(201).json((await issue(user, undefined, input.device)).body);
  }));

  r.post('/auth/session', strict, ah(async (req, res) => {
    const input = parse(sessionSchema, req.body, res);
    if (!input) return;
    const user = await findUserByEmail(db, input.email.toLowerCase().trim());
    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    res.json((await issue(user, undefined, input.device)).body);
  }));

  r.post('/auth/refresh', ah(async (req, res) => {
    const input = parse(refreshSchema, req.body, res);
    if (!input) return;
    const current = await db.row<RefreshToken>('SELECT * FROM "RefreshToken" WHERE "tokenHash" = $1', [sha256hex(input.refreshToken)]);
    const expired = 'Tu sesión caducó. Inicia sesión de nuevo.';
    const owner = current && (await findUser(db, current.userId));
    if (!current || !owner) return res.status(401).json({ error: expired });
    if (current.revokedAt) {
      // Reutilización de un token ya rotado: se corta toda la cadena.
      await revokeFamily(current.family);
      return res.status(401).json({ error: expired });
    }
    if (current.expiresAt < new Date() || current.tokenVersion !== owner.tokenVersion) {
      await db.exec('UPDATE "RefreshToken" SET "revokedAt" = $2 WHERE "id" = $1', [current.id, new Date()]);
      return res.status(401).json({ error: expired });
    }
    // Rotación atómica: si dos peticiones llegan a la vez, solo una gana.
    const count = await db.exec('UPDATE "RefreshToken" SET "revokedAt" = $2 WHERE "id" = $1 AND "revokedAt" IS NULL', [current.id, new Date()]);
    if (count === 0) return res.status(401).json({ error: expired });
    const next = await issue(owner, current.family, current.deviceName);
    await db.exec('UPDATE "RefreshToken" SET "replacedById" = $2 WHERE "id" = $1', [current.id, next.row.id]);
    res.json(next.body);
  }));

  // Cierra esta sesión. No pide token de acceso: basta con el de renovación.
  r.post('/auth/logout', ah(async (req, res) => {
    const input = parse(refreshSchema, req.body, res);
    if (!input) return;
    const row = await db.row<RefreshToken>('SELECT "family" FROM "RefreshToken" WHERE "tokenHash" = $1', [sha256hex(input.refreshToken)]);
    if (row) await revokeFamily(row.family);
    res.json({ ok: true });
  }));

  // Registra (o reasigna) el token push de este dispositivo.
  r.put('/devices', requireAuth, ah(async (req, res) => {
    const input = parse(deviceSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const now = new Date();
    await db.exec(
      `INSERT INTO "PushDevice" ("id", "userId", "token", "platform", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT ("token") DO UPDATE SET "userId" = EXCLUDED."userId", "platform" = EXCLUDED."platform", "updatedAt" = EXCLUDED."updatedAt"`,
      [newId(), userId, input.token, input.platform, now],
    );
    res.json({ ok: true });
  }));

  r.delete('/devices/:token', requireAuth, ah(async (req, res) => {
    await db.exec('DELETE FROM "PushDevice" WHERE "token" = $1 AND "userId" = $2', [String(req.params.token), req.userId]);
    res.json({ ok: true });
  }));

  return r;
}

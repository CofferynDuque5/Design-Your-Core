import crypto from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Auth } from '../auth.js';
import { ah } from '../lib/http.js';
import { sha256hex } from '../lib/security.js';
import { publicUser } from '../routes/auth.js';
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
  prisma: PrismaClient;
  auth: Auth;
  requireAuth: RequestHandler;
  strict: RequestHandler;
}

export function sessionRoutes({ prisma, auth, requireAuth, strict }: Deps): Router {
  const r = Router();

  async function issue(user: User, family?: string, deviceName?: string | null) {
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    const row = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(refreshToken),
        family: family ?? crypto.randomUUID(),
        tokenVersion: user.tokenVersion,
        deviceName: deviceName ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
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
    if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name || email.split('@')[0],
        passwordHash: await bcrypt.hash(input.password, 12),
        gender: 'otro',
        blob: { create: { data: {} } },
      },
    });
    res.status(201).json((await issue(user, undefined, input.device)).body);
  }));

  r.post('/auth/session', strict, ah(async (req, res) => {
    const input = parse(sessionSchema, req.body, res);
    if (!input) return;
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase().trim() } });
    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    res.json((await issue(user, undefined, input.device)).body);
  }));

  r.post('/auth/refresh', ah(async (req, res) => {
    const input = parse(refreshSchema, req.body, res);
    if (!input) return;
    const current = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256hex(input.refreshToken) }, include: { user: true } });
    const expired = 'Tu sesión caducó. Inicia sesión de nuevo.';
    if (!current) return res.status(401).json({ error: expired });
    if (current.revokedAt) {
      // Reutilización de un token ya rotado: se corta toda la cadena.
      await prisma.refreshToken.updateMany({ where: { family: current.family, revokedAt: null }, data: { revokedAt: new Date() } });
      return res.status(401).json({ error: expired });
    }
    if (current.expiresAt < new Date() || current.tokenVersion !== current.user.tokenVersion) {
      await prisma.refreshToken.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
      return res.status(401).json({ error: expired });
    }
    // Rotación atómica: si dos peticiones llegan a la vez, solo una gana.
    const { count } = await prisma.refreshToken.updateMany({ where: { id: current.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (count === 0) return res.status(401).json({ error: expired });
    const next = await issue(current.user, current.family, current.deviceName);
    await prisma.refreshToken.update({ where: { id: current.id }, data: { replacedById: next.row.id } });
    res.json(next.body);
  }));

  // Cierra esta sesión. No pide token de acceso: basta con el de renovación.
  r.post('/auth/logout', ah(async (req, res) => {
    const input = parse(refreshSchema, req.body, res);
    if (!input) return;
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256hex(input.refreshToken) } });
    if (row) await prisma.refreshToken.updateMany({ where: { family: row.family, revokedAt: null }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  }));

  // Registra (o reasigna) el token push de este dispositivo.
  r.put('/devices', requireAuth, ah(async (req, res) => {
    const input = parse(deviceSchema, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    await prisma.pushDevice.upsert({
      where: { token: input.token },
      update: { userId, platform: input.platform },
      create: { userId, token: input.token, platform: input.platform },
    });
    res.json({ ok: true });
  }));

  r.delete('/devices/:token', requireAuth, ah(async (req, res) => {
    await prisma.pushDevice.deleteMany({ where: { token: String(req.params.token), userId: req.userId } });
    res.json({ ok: true });
  }));

  return r;
}

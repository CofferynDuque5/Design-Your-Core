import crypto from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Auth } from '../auth.js';
import type { Config } from '../config.js';
import { ah } from '../lib/http.js';
import type { Mailer } from '../lib/mailer.js';
import { EMAIL_RE, sha256hex } from '../lib/security.js';

export const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, gender: u.gender ?? 'otro', showCycle: !!u.showCycle });

const creds = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(80).optional(),
  gender: z.enum(['mujer', 'hombre', 'otro']).optional(),
});
const changePw = z.object({ current: z.string().min(1).max(200), next: z.string().min(8).max(200) });

// Hash señuelo para igualar el tiempo del login cuando el email no existe
// (evita el oráculo de tiempo para enumerar cuentas).
const DUMMY_HASH = bcrypt.hashSync('core-dummy-password-constant', 12);

export const RESET_TTL_MS = 30 * 60 * 1000;

interface Deps {
  prisma: PrismaClient;
  auth: Auth;
  mailer: Mailer;
  config: Config;
  strict: RequestHandler;
}

export function authRoutes({ prisma, auth, mailer, config, strict }: Deps): Router {
  const r = Router();
  const { signToken, requireAuth } = auth;
  const publicBase = (req: Request) => (config.publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

  r.post('/auth/register', strict, ah(async (req, res) => {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos (email válido y contraseña de 8+ caracteres)' });
    const email = parsed.data.email.toLowerCase().trim();
    const name = (parsed.data.name || email.split('@')[0]).trim();
    if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const gender = parsed.data.gender || 'otro';
    const user = await prisma.user.create({
      data: { email, name, passwordHash, gender, showCycle: gender === 'mujer', blob: { create: { data: {} } } },
    });
    res.json({ token: signToken(user.id, user.tokenVersion), user: publicUser(user) });
  }));

  r.post('/auth/login', strict, ah(async (req, res) => {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });
    const email = parsed.data.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    // Compara siempre contra un hash (real o señuelo) para no filtrar por tiempo
    // si el email existe o no.
    const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    res.json({ token: signToken(user.id, user.tokenVersion), user: publicUser(user) });
  }));

  r.get('/me', requireAuth, ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    res.json({ user: publicUser(user) });
  }));

  // Cambiar contraseña: verifica la actual, guarda la nueva y REVOCA las demás
  // sesiones (incrementa tokenVersion). Devuelve un token nuevo para esta sesión.
  r.post('/auth/change-password', requireAuth, strict, ah(async (req, res) => {
    const parsed = changePw.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'La nueva contraseña debe tener 8+ caracteres' });
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    const passwordHash = await bcrypt.hash(parsed.data.next, 12);
    const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    res.json({ ok: true, token: signToken(updated.id, updated.tokenVersion) });
  }));

  // Cerrar sesión en TODOS los demás dispositivos (revoca tokens antiguos y
  // entrega uno nuevo para el dispositivo actual).
  r.post('/auth/logout-others', requireAuth, ah(async (req, res) => {
    const updated = await prisma.user.update({ where: { id: req.userId }, data: { tokenVersion: { increment: 1 } } });
    res.json({ ok: true, token: signToken(updated.id, updated.tokenVersion) });
  }));

  // Pide el enlace de recuperación. Responde SIEMPRE 200 (no revela si el email existe).
  r.post('/auth/forgot-password', strict, ah(async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (EMAIL_RE.test(email)) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        const token = crypto.randomBytes(32).toString('base64url');
        const resetTokenHash = sha256hex(token);
        const resetExpires = new Date(Date.now() + RESET_TTL_MS);
        await prisma.user.update({ where: { id: user.id }, data: { resetTokenHash, resetExpires } });
        const link = `${publicBase(req)}/reset?token=${token}`;
        await mailer.sendResetEmail(user.email, link).catch((e) => console.error('[core-cloud] email error:', e instanceof Error ? e.message : e));
      }
    }
    res.json({ ok: true, message: 'Si el correo existe, te enviamos un enlace para restablecer la contraseña.' });
  }));

  return r;
}

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Auth } from '../auth.js';
import type { Config } from '../config.js';
import { isUniqueViolation, newId, type Db } from '../db/db.js';
import type { User } from '../db/types.js';
import { ah } from '../lib/http.js';
import type { Mailer } from '../lib/mailer.js';
import { EMAIL_RE, sha256hex, strongPassword, WEAK_PASSWORD } from '../lib/security.js';

export const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, gender: u.gender ?? 'otro', showCycle: !!u.showCycle });

export const findUser = (db: Db, id: string) => db.row<User>('SELECT * FROM "User" WHERE "id" = $1', [id]);
export const findUserByEmail = (db: Db, email: string) => db.row<User>('SELECT * FROM "User" WHERE "email" = $1', [email]);

/** Crea la cuenta y su documento vacío de la app anterior, juntos. Devuelve null si el correo ya existe. */
export function createUser(db: Db, u: { email: string; name: string; passwordHash: string; gender: string; showCycle: boolean }): Promise<User | null> {
  const created = db.tx(async (tx) => {
    const now = new Date();
    const user = (await tx.row<User>(
      'INSERT INTO "User" ("id", "email", "name", "passwordHash", "gender", "showCycle", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [newId(), u.email, u.name, u.passwordHash, u.gender, u.showCycle, now],
    )) as User;
    await tx.exec('INSERT INTO "Blob" ("userId", "data", "updatedAt") VALUES ($1, \'{}\'::jsonb, $2)', [user.id, now]);
    return user;
  });
  return created.catch((e: unknown) => {
    if (isUniqueViolation(e)) return null;
    throw e;
  });
}

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
  db: Db;
  auth: Auth;
  mailer: Mailer;
  config: Config;
  strict: RequestHandler;
}

export function authRoutes({ db, auth, mailer, config, strict }: Deps): Router {
  const r = Router();
  const { signToken, requireAuth } = auth;
  const publicBase = (req: Request) => (config.publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

  r.post('/auth/register', strict, ah(async (req, res) => {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos (email válido y contraseña de 8+ caracteres)' });
    if (!strongPassword(parsed.data.password)) return res.status(400).json({ error: WEAK_PASSWORD });
    const email = parsed.data.email.toLowerCase().trim();
    const name = (parsed.data.name || email.split('@')[0]).trim();
    if (await findUserByEmail(db, email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const gender = parsed.data.gender || 'otro';
    const user = await createUser(db, { email, name, passwordHash, gender, showCycle: gender === 'mujer' });
    if (!user) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    res.json({ token: signToken(user.id, user.tokenVersion), user: publicUser(user) });
  }));

  r.post('/auth/login', strict, ah(async (req, res) => {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });
    const email = parsed.data.email.toLowerCase().trim();
    const user = await findUserByEmail(db, email);
    // Compara siempre contra un hash (real o señuelo) para no filtrar por tiempo
    // si el email existe o no.
    const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    res.json({ token: signToken(user.id, user.tokenVersion), user: publicUser(user) });
  }));

  r.get('/me', requireAuth, ah(async (req, res) => {
    const user = await findUser(db, req.userId as string);
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    res.json({ user: publicUser(user) });
  }));

  // Cambiar contraseña: verifica la actual, guarda la nueva y REVOCA las demás
  // sesiones (incrementa tokenVersion). Devuelve un token nuevo para esta sesión.
  r.post('/auth/change-password', requireAuth, strict, ah(async (req, res) => {
    const parsed = changePw.safeParse(req.body);
    if (!parsed.success || !strongPassword(parsed.data.next)) return res.status(400).json({ error: WEAK_PASSWORD });
    const user = await findUser(db, req.userId as string);
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    const passwordHash = await bcrypt.hash(parsed.data.next, 12);
    const updated = await db.row<User>('UPDATE "User" SET "passwordHash" = $2, "tokenVersion" = "tokenVersion" + 1 WHERE "id" = $1 RETURNING *', [user.id, passwordHash]);
    if (!updated) return res.status(401).json({ error: 'Sesión inválida' });
    res.json({ ok: true, token: signToken(updated.id, updated.tokenVersion) });
  }));

  // Cerrar sesión en TODOS los demás dispositivos (revoca tokens antiguos y
  // entrega uno nuevo para el dispositivo actual).
  r.post('/auth/logout-others', requireAuth, ah(async (req, res) => {
    const updated = await db.row<User>('UPDATE "User" SET "tokenVersion" = "tokenVersion" + 1 WHERE "id" = $1 RETURNING *', [req.userId]);
    if (!updated) return res.status(401).json({ error: 'Sesión inválida' });
    res.json({ ok: true, token: signToken(updated.id, updated.tokenVersion) });
  }));

  // Pide el enlace de recuperación. Responde SIEMPRE 200 (no revela si el email existe).
  r.post('/auth/forgot-password', strict, ah(async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (EMAIL_RE.test(email)) {
      const user = await findUserByEmail(db, email);
      if (user) {
        const token = crypto.randomBytes(32).toString('base64url');
        const resetTokenHash = sha256hex(token);
        const resetExpires = new Date(Date.now() + RESET_TTL_MS);
        await db.exec('UPDATE "User" SET "resetTokenHash" = $2, "resetExpires" = $3 WHERE "id" = $1', [user.id, resetTokenHash, resetExpires]);
        const link = `${publicBase(req)}/reset?token=${token}`;
        await mailer.sendResetEmail(user.email, link).catch((e) => console.error('[core-cloud] email error:', e instanceof Error ? e.message : e));
      }
    }
    res.json({ ok: true, message: 'Si el correo existe, te enviamos un enlace para restablecer la contraseña.' });
  }));

  return r;
}

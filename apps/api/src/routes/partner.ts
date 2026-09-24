import type { PrismaClient } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
import type { Config } from '../config.js';
import { ah } from '../lib/http.js';
import type { Mailer } from '../lib/mailer.js';
import { isLocalOrigin, isTrustedOrigin } from '../lib/origins.js';
import { EMAIL_RE, makeInviteCode } from '../lib/security.js';

interface Deps {
  prisma: PrismaClient;
  requireAuth: RequestHandler;
  strict: RequestHandler;
  mailer: Mailer;
  config: Config;
}

// Resume los hábitos de una persona a partir de su documento (vista compartida).
export function habitSummary(data: unknown) {
  const raw = (data as { habits?: unknown } | null)?.habits;
  const habits = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  const list = habits.map((h) => ({ label: String(h.label ?? ''), done: !!h.done, streak: Number(h.streak ?? 0) }));
  return { habits: list, doneToday: list.filter((h) => h.done).length, total: list.length };
}

/**
 * Decide la URL de la app que va en el enlace de invitación. Se acepta la URL
 * que manda el cliente si su origen es de confianza (CLIENT_ORIGIN o un
 * subdominio propio, igual que CORS); si no, se usa el primer CLIENT_ORIGIN.
 */
export function resolveInviteAppUrl(requested: string, config: Config): string {
  const fallback = config.clientOrigins[0] || '';
  try {
    const u = new URL(requested.trim());
    if (u.protocol !== 'https:' && !isLocalOrigin(u.origin)) return fallback;
    if (isTrustedOrigin(u.origin, config) || (!config.clientOrigins.length && isLocalOrigin(u.origin))) {
      return u.origin + u.pathname;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function partnerRoutes({ prisma, requireAuth, strict, mailer, config }: Deps): Router {
  const r = Router();

  // Genera (o reutiliza) el código del usuario; reintenta si choca con otro.
  async function ensureInviteCode(userId: string, current: string | null): Promise<string> {
    if (current) return current;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const updated = await prisma.user.update({ where: { id: userId }, data: { inviteCode: makeInviteCode() } });
        if (updated.inviteCode) return updated.inviteCode;
      } catch {
        /* colisión → reintenta */
      }
    }
    return '';
  }

  r.post('/partner/invite', requireAuth, ah(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!me) return res.status(401).json({ error: 'Sesión inválida' });
    if (me.partnerId) return res.status(409).json({ error: 'Ya tienes una pareja vinculada. Desvincúlala primero.' });
    const code = await ensureInviteCode(me.id, me.inviteCode);
    if (!code) return res.status(500).json({ error: 'No se pudo generar el código' });
    res.json({ code });
  }));

  // Envía la invitación de pareja por correo con el enlace de la app.
  r.post('/partner/invite/email', requireAuth, strict, ah(async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Correo no válido' });
    const me = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!me) return res.status(401).json({ error: 'Sesión inválida' });
    if (me.partnerId) return res.status(409).json({ error: 'Ya tienes una pareja vinculada.' });
    const code = await ensureInviteCode(me.id, me.inviteCode);
    if (!code) return res.status(500).json({ error: 'No se pudo generar el código' });

    const appUrl = resolveInviteAppUrl(String(req.body?.appUrl || ''), config);
    if (!appUrl) return res.status(400).json({ error: 'No se pudo determinar la URL de la app (configura CLIENT_ORIGIN).' });
    const base = appUrl.split('#')[0].split('?')[0];
    const link = `${base}?invite=${code}`;
    let sent = true;
    try {
      await mailer.sendPartnerEmail(email, link, me.name);
    } catch (e) {
      sent = false;
      console.error('[core-cloud] partner email error:', e instanceof Error ? e.message : e);
    }
    res.json({ ok: true, code, sent: sent && mailer.enabled });
  }));

  r.post('/partner/accept', requireAuth, strict, ah(async (req, res) => {
    const code = String(req.body?.code || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'Código inválido' });
    const me = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!me) return res.status(401).json({ error: 'Sesión inválida' });
    if (me.partnerId) return res.status(409).json({ error: 'Ya tienes una pareja vinculada. Desvincúlala primero.' });
    const inviter = await prisma.user.findUnique({ where: { inviteCode: code } });
    if (!inviter) return res.status(404).json({ error: 'Código no válido o vencido' });
    if (inviter.id === me.id) return res.status(400).json({ error: 'Ese es tu propio código' });
    if (inviter.partnerId) return res.status(409).json({ error: 'Esa persona ya tiene una pareja vinculada.' });
    await prisma.$transaction([
      prisma.user.update({ where: { id: me.id }, data: { partnerId: inviter.id, inviteCode: null } }),
      prisma.user.update({ where: { id: inviter.id }, data: { partnerId: me.id, inviteCode: null } }),
    ]);
    res.json({ ok: true, partner: { name: inviter.name } });
  }));

  r.get('/partner', requireAuth, ah(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!me) return res.status(401).json({ error: 'Sesión inválida' });
    if (!me.partnerId) return res.json({ partner: null });
    const partner = await prisma.user.findUnique({ where: { id: me.partnerId }, include: { blob: true } });
    if (!partner) return res.json({ partner: null });
    res.json({ partner: { name: partner.name }, ...habitSummary(partner.blob?.data) });
  }));

  r.delete('/partner', requireAuth, ah(async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.userId } });
    if (me?.partnerId) {
      const pid = me.partnerId;
      await prisma.user.update({ where: { id: me.id }, data: { partnerId: null } });
      await prisma.user.updateMany({ where: { id: pid }, data: { partnerId: null } });
    }
    res.json({ ok: true });
  }));

  return r;
}

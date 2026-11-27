import {
  effectivePlan,
  extendPlan,
  localAmount,
  methodReady,
  paymentRequestInput,
  paymentReviewInput,
  paymentSettingsSchema,
  publicMethod,
  withDefaults,
  type PaymentRequest,
  type PaymentSettings,
  type PaymentStatus,
} from '@dyc/core';
import { Router, type RequestHandler, type Request } from 'express';
import type { Config } from '../config.js';
import { newId, type Db } from '../db/db.js';
import type { User } from '../db/types.js';
import { ah } from '../lib/http.js';
import { parse } from '../v2/util.js';

interface PaymentRow {
  id: string;
  userId: string;
  plan: string;
  period: string;
  methodId: string;
  methodName: string;
  currency: string;
  amount: string;
  amountUsd: string;
  reference: string;
  payerName: string;
  note: string;
  proof: string | null;
  status: string;
  adminNote: string;
  createdAt: Date;
  reviewedAt: Date | null;
}

type BillingUser = User & { plan: string; planUntil: Date | null };

const SETTINGS_KEY = 'payments';

export async function loadPaymentSettings(db: Db): Promise<PaymentSettings> {
  const row = await db.row<{ value: PaymentSettings }>('SELECT "value" FROM "AppSetting" WHERE "key" = $1', [SETTINGS_KEY]);
  return withDefaults(row?.value);
}

const toRequest = (r: PaymentRow, withProof: boolean): PaymentRequest => ({
  id: r.id,
  plan: r.plan as PaymentRequest['plan'],
  period: r.period as PaymentRequest['period'],
  methodId: r.methodId,
  methodName: r.methodName,
  currency: r.currency as PaymentRequest['currency'],
  amount: Number(r.amount),
  amountUsd: Number(r.amountUsd),
  reference: r.reference,
  payerName: r.payerName,
  note: r.note,
  ...(withProof && r.proof ? { proof: r.proof } : {}),
  hasProof: !!r.proof,
  status: r.status as PaymentStatus,
  adminNote: r.adminNote,
  createdAt: r.createdAt.toISOString(),
  reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
});

/** Columnas de la lista (sin el comprobante, que pesa). */
const LIST_COLS = `p."id", p."userId", p."plan", p."period", p."methodId", p."methodName", p."currency", p."amount", p."amountUsd", p."reference", p."payerName", p."note",
  CASE WHEN p."proof" IS NULL THEN NULL ELSE '' END AS "proof", p."status", p."adminNote", p."createdAt", p."reviewedAt"`;

/**
 * Planes y pagos manuales. La persona ve los métodos con los datos que cargó
 * el administrador, paga por su cuenta y envía la referencia con el
 * comprobante; el administrador (ADMIN_EMAILS) lo aprueba y se activa el plan.
 */
export function paymentRoutes({ db, requireAuth, strict, config }: { db: Db; requireAuth: RequestHandler; strict: RequestHandler; config: Config }): Router {
  const r = Router();

  const me = (req: Request) => db.row<BillingUser>('SELECT * FROM "User" WHERE "id" = $1', [req.userId]);
  const isAdmin = (u: User | null) => !!u && config.adminEmails.includes(u.email.toLowerCase());

  const requireAdmin: RequestHandler = (req, res, next) => {
    me(req)
      .then((u) => (isAdmin(u) ? next() : res.status(403).json({ error: 'Solo la administración puede hacer esto' })))
      .catch(next);
  };

  /** Plan vigente, precios, métodos listos para pagar y mis solicitudes. */
  r.get('/billing', requireAuth, ah(async (req, res) => {
    const user = await me(req);
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    const settings = await loadPaymentSettings(db);
    const rows = await db.rows<PaymentRow>(`SELECT ${LIST_COLS} FROM "PaymentRequest" p WHERE p."userId" = $1 ORDER BY p."createdAt" DESC LIMIT 20`, [user.id]);
    const plan = effectivePlan(user.plan, user.planUntil);
    res.json({
      plan,
      planUntil: plan === 'gratis' ? null : user.planUntil?.toISOString() ?? null,
      admin: isAdmin(user),
      prices: settings.prices,
      methods: settings.methods.filter(methodReady).map(publicMethod),
      requests: rows.map((x) => toRequest(x, false)),
    });
  }));

  /** Envía un pago para revisión (uno pendiente a la vez). */
  r.post('/billing/requests', requireAuth, strict, ah(async (req, res) => {
    const input = parse(paymentRequestInput, req.body, res);
    if (!input) return;
    const userId = req.userId as string;
    const settings = await loadPaymentSettings(db);
    const method = settings.methods.find((x) => x.id === input.methodId);
    if (!method || !methodReady(method)) return res.status(400).json({ error: 'Ese método de pago no está disponible' });
    const pending = await db.row('SELECT 1 FROM "PaymentRequest" WHERE "userId" = $1 AND "status" = $2', [userId, 'pendiente']);
    if (pending) return res.status(409).json({ error: 'Ya tienes un pago en revisión. Espera la respuesta o cancélalo para enviar otro.' });
    const usd = settings.prices[input.plan][input.period];
    const row = await db.row<PaymentRow>(
      `INSERT INTO "PaymentRequest" ("id", "userId", "plan", "period", "methodId", "methodName", "currency", "amount", "amountUsd", "reference", "payerName", "note", "proof")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [newId(), userId, input.plan, input.period, method.id, method.name, method.currency, localAmount(usd, method), usd, input.reference, input.payerName, input.note, input.proof ?? null],
    );
    res.status(201).json({ request: toRequest(row as PaymentRow, false) });
  }));

  /** Cancela un pago propio que sigue en revisión. */
  r.delete('/billing/requests/:id', requireAuth, ah(async (req, res) => {
    const done = await db.row('DELETE FROM "PaymentRequest" WHERE "id" = $1 AND "userId" = $2 AND "status" = $3 RETURNING "id"', [req.params.id, req.userId, 'pendiente']);
    if (!done) return res.status(404).json({ error: 'No hay un pago en revisión con ese número' });
    res.json({ ok: true });
  }));

  // ---- Administración ----

  r.get('/admin/payments/settings', requireAuth, requireAdmin, ah(async (_req, res) => {
    res.json({ settings: await loadPaymentSettings(db) });
  }));

  r.put('/admin/payments/settings', requireAuth, requireAdmin, ah(async (req, res) => {
    const settings = parse(paymentSettingsSchema, req.body?.settings, res);
    if (!settings) return;
    await db.exec(
      `INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ($1, $2, now())
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()`,
      [SETTINGS_KEY, JSON.stringify(settings)],
    );
    res.json({ settings: withDefaults(settings as PaymentSettings) });
  }));

  r.get('/admin/payments/requests', requireAuth, requireAdmin, ah(async (req, res) => {
    const status = typeof req.query.status === 'string' && ['pendiente', 'aprobado', 'rechazado'].includes(req.query.status) ? req.query.status : null;
    const rows = await db.rows<PaymentRow & { userName: string; userEmail: string }>(
      `SELECT ${LIST_COLS}, u."name" AS "userName", u."email" AS "userEmail" FROM "PaymentRequest" p JOIN "User" u ON u."id" = p."userId"
       ${status ? 'WHERE p."status" = $1' : ''} ORDER BY (p."status" = 'pendiente') DESC, p."createdAt" DESC LIMIT 200`,
      status ? [status] : [],
    );
    const pending = await db.row<{ n: string }>('SELECT count(*) AS n FROM "PaymentRequest" WHERE "status" = $1', ['pendiente']);
    res.json({
      pending: Number(pending?.n ?? 0),
      requests: rows.map((x) => ({ ...toRequest(x, false), user: { name: x.userName, email: x.userEmail } })),
    });
  }));

  /** El comprobante de una solicitud (aparte, porque pesa). */
  r.get('/admin/payments/requests/:id/proof', requireAuth, requireAdmin, ah(async (req, res) => {
    const row = await db.row<{ proof: string | null }>('SELECT "proof" FROM "PaymentRequest" WHERE "id" = $1', [req.params.id]);
    if (!row?.proof) return res.status(404).json({ error: 'Esta solicitud no tiene comprobante' });
    res.json({ proof: row.proof });
  }));

  const review = (status: 'aprobado' | 'rechazado') =>
    ah(async (req, res) => {
      const input = parse(paymentReviewInput, req.body ?? {}, res);
      if (!input) return;
      const result = await db.tx(async (tx) => {
        const p = await tx.row<PaymentRow>('SELECT * FROM "PaymentRequest" WHERE "id" = $1 FOR UPDATE', [req.params.id]);
        if (!p) return { code: 404, error: 'No existe esa solicitud' } as const;
        if (p.status !== 'pendiente') return { code: 409, error: 'Esta solicitud ya fue revisada' } as const;
        await tx.exec('UPDATE "PaymentRequest" SET "status" = $2, "adminNote" = $3, "reviewedAt" = now() WHERE "id" = $1', [p.id, status, input.note]);
        if (status === 'aprobado') {
          const u = await tx.row<BillingUser>('SELECT * FROM "User" WHERE "id" = $1 FOR UPDATE', [p.userId]);
          if (u) {
            const until = extendPlan(effectivePlan(u.plan, u.planUntil) === 'gratis' ? null : u.planUntil, p.period as 'mes' | 'ano');
            await tx.exec('UPDATE "User" SET "plan" = $2, "planUntil" = $3 WHERE "id" = $1', [u.id, p.plan, until]);
            // El plan Pareja también activa la cuenta enlazada.
            if (p.plan === 'pareja' && u.partnerId) await tx.exec('UPDATE "User" SET "plan" = $2, "planUntil" = $3 WHERE "id" = $1', [u.partnerId, 'pareja', until]);
          }
        }
        const row = await tx.row<PaymentRow>(`SELECT ${LIST_COLS} FROM "PaymentRequest" p WHERE p."id" = $1`, [p.id]);
        return { code: 200, request: toRequest(row as PaymentRow, false) } as const;
      });
      if (result.code !== 200) return res.status(result.code).json({ error: result.error });
      res.json({ request: result.request });
    });

  r.post('/admin/payments/requests/:id/approve', requireAuth, requireAdmin, review('aprobado'));
  r.post('/admin/payments/requests/:id/reject', requireAuth, requireAdmin, review('rechazado'));

  return r;
}

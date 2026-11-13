import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from '@dyc/core';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, db, makeApp, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => db.close());

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function filled(): PaymentSettings {
  const s = structuredClone(DEFAULT_PAYMENT_SETTINGS);
  const ve = s.methods.find((m) => m.id === 've-bancos')!;
  ve.rate = 40;
  ve.fields[0].value = 'Banesco';
  ve.fields[1].value = '0414-0000000';
  const zelle = s.methods.find((m) => m.id === 'zelle')!;
  zelle.fields[0].value = 'pagos@example.com';
  return s;
}

describe('pasarela de pago manual', () => {
  it('el administrador carga los datos, la persona paga, se aprueba y se activa el plan', async () => {
    const admin = 'jefa@example.com';
    const { api } = makeApp({ config: { adminEmails: [admin] } });
    const boss = await registerUser(api, { email: admin });
    const a = await registerUser(api);

    // Sin datos cargados no hay métodos para pagar.
    const empty = await api.get('/api/v2/billing').set(bearer(a.token)).expect(200);
    expect(empty.body).toMatchObject({ plan: 'gratis', planUntil: null, admin: false, methods: [] });
    expect(empty.body.prices.pro).toEqual({ mes: 3.99, ano: 29.99 });

    // Solo la administración cambia los ajustes.
    await api.put('/api/v2/admin/payments/settings').set(bearer(a.token)).send({ settings: filled() }).expect(403);
    await api.put('/api/v2/admin/payments/settings').set(bearer(boss.token)).send({ settings: filled() }).expect(200);
    expect((await api.get('/api/v2/billing').set(bearer(boss.token))).body.admin).toBe(true);

    const billing = await api.get('/api/v2/billing').set(bearer(a.token)).expect(200);
    expect(billing.body.methods.map((m: { id: string }) => m.id)).toEqual(['ve-bancos', 'zelle']);
    // Solo se muestran los datos con valor.
    expect(billing.body.methods[0].fields).toEqual([{ label: 'Banco', value: 'Banesco' }, { label: 'Teléfono (Pago Móvil)', value: '0414-0000000' }]);

    const sent = await api
      .post('/api/v2/billing/requests')
      .set(bearer(a.token))
      .send({ plan: 'pro', period: 'mes', methodId: 've-bancos', reference: '00123456', payerName: 'Ana Pérez', proof: PNG })
      .expect(201);
    expect(sent.body.request).toMatchObject({ status: 'pendiente', currency: 'VES', amount: 159.6, amountUsd: 3.99, hasProof: true });
    expect(sent.body.request.proof).toBeUndefined();
    // Uno pendiente a la vez.
    await api.post('/api/v2/billing/requests').set(bearer(a.token)).send({ plan: 'pro', period: 'mes', methodId: 'zelle', reference: 'ZX-1', payerName: 'Ana' }).expect(409);
    // Un método sin datos no sirve.
    await api.delete(`/api/v2/billing/requests/${sent.body.request.id}`).set(bearer(a.token)).expect(200);
    await api.post('/api/v2/billing/requests').set(bearer(a.token)).send({ plan: 'pro', period: 'mes', methodId: 'paypal', reference: 'P-1', payerName: 'Ana' }).expect(400);
    const again = await api
      .post('/api/v2/billing/requests')
      .set(bearer(a.token))
      .send({ plan: 'pro', period: 'ano', methodId: 'zelle', reference: 'ZX-2', payerName: 'Ana Pérez', proof: PNG })
      .expect(201);

    const list = await api.get('/api/v2/admin/payments/requests').set(bearer(boss.token)).expect(200);
    expect(list.body.pending).toBe(1);
    expect(list.body.requests[0]).toMatchObject({ reference: 'ZX-2', amount: 29.99, user: { email: a.email } });
    await api.get('/api/v2/admin/payments/requests').set(bearer(a.token)).expect(403);
    const proof = await api.get(`/api/v2/admin/payments/requests/${again.body.request.id}/proof`).set(bearer(boss.token)).expect(200);
    expect(proof.body.proof).toBe(PNG);

    await api.post(`/api/v2/admin/payments/requests/${again.body.request.id}/approve`).set(bearer(boss.token)).send({ note: 'Recibido' }).expect(200);
    await api.post(`/api/v2/admin/payments/requests/${again.body.request.id}/reject`).set(bearer(boss.token)).send({}).expect(409);

    const after = await api.get('/api/v2/billing').set(bearer(a.token)).expect(200);
    expect(after.body.plan).toBe('pro');
    const days = (Date.parse(after.body.planUntil) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(360);
    expect(after.body.requests[0]).toMatchObject({ status: 'aprobado', adminNote: 'Recibido' });
  });

  it('rechazar no activa nada y el plan Pareja activa también a la pareja enlazada', async () => {
    const admin = 'jefa@example.com';
    const { api } = makeApp({ config: { adminEmails: [admin] } });
    const boss = await registerUser(api, { email: admin });
    await api.put('/api/v2/admin/payments/settings').set(bearer(boss.token)).send({ settings: filled() }).expect(200);
    const a = await registerUser(api);
    const b = await registerUser(api);
    const inv = await api.post('/api/partner/invite').set(bearer(a.token)).expect(200);
    await api.post('/api/partner/accept').set(bearer(b.token)).send({ code: inv.body.code }).expect(200);

    const r1 = await api.post('/api/v2/billing/requests').set(bearer(a.token)).send({ plan: 'pareja', period: 'mes', methodId: 'zelle', reference: 'Z-9', payerName: 'Ana' }).expect(201);
    await api.post(`/api/v2/admin/payments/requests/${r1.body.request.id}/reject`).set(bearer(boss.token)).send({ note: 'No llegó el pago' }).expect(200);
    expect((await api.get('/api/v2/billing').set(bearer(a.token))).body).toMatchObject({ plan: 'gratis', requests: [{ status: 'rechazado', adminNote: 'No llegó el pago' }] });

    const r2 = await api.post('/api/v2/billing/requests').set(bearer(a.token)).send({ plan: 'pareja', period: 'mes', methodId: 'zelle', reference: 'Z-10', payerName: 'Ana' }).expect(201);
    await api.post(`/api/v2/admin/payments/requests/${r2.body.request.id}/approve`).set(bearer(boss.token)).expect(200);
    expect((await api.get('/api/v2/billing').set(bearer(a.token))).body.plan).toBe('pareja');
    expect((await api.get('/api/v2/billing').set(bearer(b.token))).body.plan).toBe('pareja');
  });

  it('valida los ajustes y el comprobante', async () => {
    const admin = 'jefa@example.com';
    const { api } = makeApp({ config: { adminEmails: [admin] } });
    const boss = await registerUser(api, { email: admin });
    const bad = filled();
    bad.methods[1].id = bad.methods[0].id;
    await api.put('/api/v2/admin/payments/settings').set(bearer(boss.token)).send({ settings: bad }).expect(400);
    await api.put('/api/v2/admin/payments/settings').set(bearer(boss.token)).send({ settings: filled() }).expect(200);
    const a = await registerUser(api);
    await api.post('/api/v2/billing/requests').set(bearer(a.token)).send({ plan: 'pro', period: 'mes', methodId: 'zelle', reference: 'Z-1', payerName: 'Ana', proof: 'data:text/html;base64,PGgxPg==' }).expect(400);
  });
});

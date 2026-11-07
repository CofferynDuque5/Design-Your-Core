import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sendDueAlarms, type PushPayload, type PushSender } from '../src/lib/webPush.js';
import { bearer, db, makeApp, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => db.close());

const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'BPublicKeyDePrueba123', auth: 'secreto1' } };

describe('avisos del panel web (Web Push)', () => {
  it('da la clave pública, guarda la suscripción y envía las alarmas a su hora una sola vez', async () => {
    const { api } = makeApp();
    const key = await api.get('/api/push/key').expect(200);
    expect(key.body.publicKey).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    // La misma clave las dos veces (se guarda en la base).
    expect((await api.get('/api/push/key')).body.publicKey).toBe(key.body.publicKey);

    const { token } = await registerUser(api);
    await api.post('/api/push/subscription').set(bearer(token)).send({ subscription: sub }).expect(200);
    const soon = new Date(Date.now() + 60_000).toISOString();
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const put = await api
      .put('/api/push/alarms')
      .set(bearer(token))
      .send({ alarms: [{ id: 'task-1@x', at: soon, title: 'Tarea: llamar', body: 'A las 10:00', url: '/agenda' }, { id: 'rem-2@y', at: later, title: 'Pagar', body: '', url: '/calendario' }] })
      .expect(200);
    expect(put.body.count).toBe(2);

    const sent: PushPayload[] = [];
    const send: PushSender = async (_s, p) => {
      sent.push(p);
      return true;
    };
    expect(await sendDueAlarms(db, send, new Date())).toBe(0);
    const at = new Date(Date.now() + 90_000);
    expect(await sendDueAlarms(db, send, at)).toBe(1);
    expect(sent[0]).toEqual({ title: 'Tarea: llamar', body: 'A las 10:00', url: '/agenda', tag: 'task-1@x' });
    // Ya enviada: no se repite.
    expect(await sendDueAlarms(db, send, at)).toBe(0);
  });

  it('borra la suscripción si el navegador ya no existe y rechaza datos raros', async () => {
    const { api } = makeApp();
    const { token } = await registerUser(api);
    await api.post('/api/push/subscription').set(bearer(token)).send({ subscription: { ...sub, endpoint: 'http://inseguro.example.com' } }).expect(400);
    await api.put('/api/push/alarms').set(bearer(token)).send({ alarms: [{ id: 'x', at: new Date().toISOString(), title: 'x', url: 'https://otro.sitio' }] }).expect(400);
    await api.post('/api/push/subscription').set(bearer(token)).send({ subscription: sub }).expect(200);
    await api.put('/api/push/alarms').set(bearer(token)).send({ alarms: [{ id: 'a', at: new Date(Date.now() + 1000).toISOString(), title: 'Ya' }] }).expect(200);
    await sendDueAlarms(db, async () => false, new Date(Date.now() + 5000));
    expect(await db.row('SELECT 1 FROM "WebPushSubscription"')).toBeNull();
  });

  it('pide sesión para suscribirse', async () => {
    const { api } = makeApp();
    await api.post('/api/push/subscription').send({ subscription: sub }).expect(401);
  });
});

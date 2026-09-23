import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveInviteAppUrl } from '../src/routes/partner.js';
import { bearer, fakeMailer, makeApp, prisma, registerUser, resetDb, testConfig } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('pareja', () => {
  it('invita con código, acepta y comparte el resumen de hábitos', async () => {
    const { api } = makeApp();
    const a = await registerUser(api, { name: 'Ana' });
    const b = await registerUser(api, { name: 'Beto' });

    const inv = await api.post('/api/partner/invite').set(bearer(a.token)).expect(200);
    expect(inv.body.code).toMatch(/^[A-Z2-9]{6}$/);
    const again = await api.post('/api/partner/invite').set(bearer(a.token)).expect(200);
    expect(again.body.code).toBe(inv.body.code);

    await api.post('/api/partner/accept').set(bearer(a.token)).send({ code: inv.body.code }).expect(400);
    const acc = await api.post('/api/partner/accept').set(bearer(b.token)).send({ code: inv.body.code.toLowerCase() }).expect(200);
    expect(acc.body.partner).toEqual({ name: 'Ana' });

    await api.put('/api/sync').set(bearer(a.token)).send({ data: { habits: [{ label: 'Leer', done: true, streak: 5 }, { label: 'Agua', done: false }] } });
    const view = await api.get('/api/partner').set(bearer(b.token)).expect(200);
    expect(view.body).toMatchObject({ partner: { name: 'Ana' }, doneToday: 1, total: 2 });
    expect(view.body.habits[0]).toEqual({ label: 'Leer', done: true, streak: 5 });

    await api.post('/api/partner/invite').set(bearer(a.token)).expect(409);
    await api.delete('/api/partner').set(bearer(b.token)).expect(200);
    expect((await api.get('/api/partner').set(bearer(a.token))).body.partner).toBeNull();
  });

  it('rechaza códigos inválidos o desconocidos', async () => {
    const { api } = makeApp();
    const a = await registerUser(api);
    await api.post('/api/partner/accept').set(bearer(a.token)).send({ code: '12' }).expect(400);
    await api.post('/api/partner/accept').set(bearer(a.token)).send({ code: 'ZZZZZZ' }).expect(404);
  });

  it('envía la invitación por correo con un enlace a la app', async () => {
    const mailer = fakeMailer();
    const { api } = makeApp({ mailer });
    const a = await registerUser(api, { name: 'Ana' });
    const res = await api
      .post('/api/partner/invite/email')
      .set(bearer(a.token))
      .send({ email: 'pareja@example.com', appUrl: 'https://app.example.com/?x=1#inicio' })
      .expect(200);
    expect(res.body).toMatchObject({ ok: true, sent: true });
    expect(mailer.sent[0]).toMatchObject({ kind: 'partner', to: 'pareja@example.com', inviter: 'Ana', link: `https://app.example.com/?invite=${res.body.code}` });
  });

  it('informa sent=false si no hay SMTP', async () => {
    const { api } = makeApp({ mailer: fakeMailer(false) });
    const a = await registerUser(api);
    const res = await api.post('/api/partner/invite/email').set(bearer(a.token)).send({ email: 'p@example.com', appUrl: 'https://app.example.com/' }).expect(200);
    expect(res.body.sent).toBe(false);
  });
});

describe('URL del enlace de invitación', () => {
  const config = testConfig({ clientOrigins: ['https://desingyourcore.nvcorx.com'], allowedRootDomains: ['nvcorx.com'] });

  it('respeta la URL real de la app si es un subdominio propio', () => {
    // Antes se reemplazaba por CLIENT_ORIGIN y el enlace llevaba al dominio equivocado.
    expect(resolveInviteAppUrl('https://designyourcore.nvcorx.com/app/?a=1', config)).toBe('https://designyourcore.nvcorx.com/app/');
  });

  it('no acepta dominios ajenos ni http', () => {
    expect(resolveInviteAppUrl('https://phishing.example.net/', config)).toBe('https://desingyourcore.nvcorx.com');
    expect(resolveInviteAppUrl('http://designyourcore.nvcorx.com/', config)).toBe('https://desingyourcore.nvcorx.com');
    expect(resolveInviteAppUrl('no es url', config)).toBe('https://desingyourcore.nvcorx.com');
  });
});

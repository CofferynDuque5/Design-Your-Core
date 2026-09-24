import jwt from 'jsonwebtoken';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, makeApp, prisma, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const PASSWORD = 'contraseña-segura';

async function mobileSession(api: ReturnType<typeof makeApp>['api']) {
  const u = await registerUser(api);
  const res = await api.post('/api/v2/auth/session').send({ email: u.email, password: PASSWORD, device: 'iPhone de Ana' }).expect(200);
  return { ...u, ...res.body } as typeof u & { accessToken: string; refreshToken: string; expiresIn: number };
}

describe('v2 · sesiones renovables', () => {
  it('registra con sesión y el token de acceso dura 15 minutos', async () => {
    const { api } = makeApp();
    const res = await api.post('/api/v2/auth/register').send({ email: 'Movil@Example.com', password: PASSWORD, name: 'Ana', device: 'Pixel' }).expect(201);
    expect(res.body).toMatchObject({ expiresIn: 900, user: { email: 'movil@example.com', name: 'Ana' } });
    const claims = jwt.decode(res.body.accessToken) as { exp: number; iat: number };
    expect(claims.exp - claims.iat).toBe(900);
    await api.get('/api/v2/profile').set(bearer(res.body.accessToken)).expect(200);
    await api.post('/api/v2/auth/register').send({ email: 'movil@example.com', password: PASSWORD }).expect(409);
  });

  it('entra con correo y contraseña; rechaza credenciales malas', async () => {
    const { api } = makeApp();
    const s = await mobileSession(api);
    expect(s.refreshToken.length).toBeGreaterThan(30);
    const row = await prisma.refreshToken.findFirstOrThrow({ where: { userId: s.user.id } });
    expect(row.tokenHash).not.toBe(s.refreshToken);
    expect(row.deviceName).toBe('iPhone de Ana');
    const bad = await api.post('/api/v2/auth/session').send({ email: s.email, password: 'otra-cosa' }).expect(401);
    expect(bad.body.error).toBe('Correo o contraseña incorrectos');
  });

  it('renueva rotando el token; el anterior ya no sirve y reutilizarlo corta la sesión', async () => {
    const { api } = makeApp();
    const s = await mobileSession(api);
    const r1 = await api.post('/api/v2/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);
    await api.get('/api/me').set(bearer(r1.body.accessToken)).expect(200);

    // Alguien reutiliza el token viejo: se revoca toda la familia, también el nuevo.
    await api.post('/api/v2/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    await api.post('/api/v2/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
  });

  it('dos renovaciones simultáneas del mismo token: solo una gana', async () => {
    const { api } = makeApp();
    const s = await mobileSession(api);
    const results = await Promise.all([1, 2].map(() => api.post('/api/v2/auth/refresh').send({ refreshToken: s.refreshToken })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('cambiar la contraseña o cerrar otras sesiones invalida las renovaciones', async () => {
    const { api } = makeApp();
    const s = await mobileSession(api);
    await api.post('/api/auth/logout-others').set(bearer(s.token)).expect(200);
    const res = await api.post('/api/v2/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    expect(res.body.error).toMatch(/caducó/);
  });

  it('una sesión caducada no se renueva', async () => {
    const { api } = makeApp();
    const s = await mobileSession(api);
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await api.post('/api/v2/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
  });

  it('cerrar sesión revoca el token de renovación', async () => {
    const { api } = makeApp();
    const s = await mobileSession(api);
    await api.post('/api/v2/auth/logout').send({ refreshToken: s.refreshToken }).expect(200);
    await api.post('/api/v2/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    await api.post('/api/v2/auth/logout').send({ refreshToken: 'x'.repeat(43) }).expect(200);
    await api.post('/api/v2/auth/refresh').send({ refreshToken: 'corto' }).expect(400);
  });
});

describe('v2 · dispositivos push', () => {
  it('registra, reasigna y borra el token del dispositivo', async () => {
    const { api } = makeApp();
    const a = await registerUser(api);
    const b = await registerUser(api);
    const token = 'ExponentPushToken[abcdefghijklmnop]';
    await api.put('/api/v2/devices').set(bearer(a.token)).send({ token, platform: 'ios' }).expect(200);
    await api.put('/api/v2/devices').set(bearer(a.token)).send({ token, platform: 'ios' }).expect(200);
    expect(await prisma.pushDevice.count()).toBe(1);

    // El mismo teléfono inicia sesión con otra cuenta: el token pasa a esa cuenta.
    await api.put('/api/v2/devices').set(bearer(b.token)).send({ token, platform: 'ios' }).expect(200);
    expect((await prisma.pushDevice.findFirstOrThrow()).userId).toBe(b.user.id);

    // Una cuenta no puede borrar el dispositivo de otra.
    await api.delete(`/api/v2/devices/${encodeURIComponent(token)}`).set(bearer(a.token)).expect(200);
    expect(await prisma.pushDevice.count()).toBe(1);
    await api.delete(`/api/v2/devices/${encodeURIComponent(token)}`).set(bearer(b.token)).expect(200);
    expect(await prisma.pushDevice.count()).toBe(0);

    await api.put('/api/v2/devices').set(bearer(a.token)).send({ token, platform: 'symbian' }).expect(400);
    await api.put('/api/v2/devices').send({ token, platform: 'ios' }).expect(401);
  });
});

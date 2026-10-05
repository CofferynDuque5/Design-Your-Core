import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, makeApp, db, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => db.close());

describe('salud', () => {
  it('responde ok', async () => {
    const { api } = makeApp();
    const res = await api.get('/api/health').expect(200);
    expect(res.body).toEqual({ ok: true, service: 'core-cloud' });
  });

  it('no cachea respuestas de la API y devuelve 404 en JSON', async () => {
    const { api } = makeApp();
    const res = await api.get('/api/no-existe').expect(404);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.error).toBe('Recurso no encontrado');
  });
});

describe('registro e inicio de sesión', () => {
  it('registra, crea el documento vacío y deja entrar', async () => {
    const { api } = makeApp();
    const { token, user, email, password } = await registerUser(api, { gender: 'mujer' });
    expect(user).toMatchObject({ email, gender: 'mujer', showCycle: true });
    expect(await db.row('SELECT 1 FROM "Blob" WHERE "userId" = $1', [user.id])).not.toBeNull();

    const me = await api.get('/api/me').set(bearer(token)).expect(200);
    expect(me.body.user.id).toBe(user.id);

    const login = await api.post('/api/auth/login').send({ email: email.toUpperCase(), password }).expect(200);
    expect(login.body.user.id).toBe(user.id);
  });

  it('no guarda la contraseña en claro', async () => {
    const { api } = makeApp();
    const { user, password } = await registerUser(api);
    const row = (await db.row<{ passwordHash: string }>('SELECT * FROM "User" WHERE "id" = $1', [user.id]))!;
    expect(row.passwordHash).not.toContain(password);
  });

  it('rechaza datos inválidos, correos repetidos y contraseñas incorrectas', async () => {
    const { api } = makeApp();
    await api.post('/api/auth/register').send({ email: 'no-es-correo', password: 'corta' }).expect(400);
    const { email } = await registerUser(api);
    await api.post('/api/auth/register').send({ email, password: 'Otra-Contraseña1' }).expect(409);
    const bad = await api.post('/api/auth/login').send({ email, password: 'equivocada' }).expect(401);
    expect(bad.body.error).toBe('Correo o contraseña incorrectos');
    await api.post('/api/auth/login').send({ email: 'nadie@example.com', password: 'lo-que-sea' }).expect(401);
  });

  it('exige un token válido', async () => {
    const { api } = makeApp();
    await api.get('/api/me').expect(401);
    await api.get('/api/me').set(bearer('basura')).expect(401);
  });

  it('limita los intentos en las rutas estrictas', async () => {
    const { api } = makeApp({ strict: 2 });
    await api.post('/api/auth/login').send({ email: 'a@example.com', password: '12345678' }).expect(401);
    await api.post('/api/auth/login').send({ email: 'a@example.com', password: '12345678' }).expect(401);
    const res = await api.post('/api/auth/login').send({ email: 'a@example.com', password: '12345678' }).expect(429);
    expect(res.body.error).toMatch(/Demasiados intentos/);
  });
});

describe('sesiones', () => {
  it('cambiar la contraseña revoca los demás tokens', async () => {
    const { api } = makeApp();
    const { token, email, password } = await registerUser(api);
    await api.post('/api/auth/change-password').set(bearer(token)).send({ current: 'mala-contraseña', next: 'Nueva-Contraseña1' }).expect(401);
    const res = await api.post('/api/auth/change-password').set(bearer(token)).send({ current: password, next: 'Nueva-Contraseña1' }).expect(200);
    await api.get('/api/me').set(bearer(token)).expect(401);
    await api.get('/api/me').set(bearer(res.body.token)).expect(200);
    await api.post('/api/auth/login').send({ email, password: 'Nueva-Contraseña1' }).expect(200);
  });

  it('cerrar sesión en otros dispositivos invalida los tokens anteriores', async () => {
    const { api } = makeApp();
    const { token, email, password } = await registerUser(api);
    const other = (await api.post('/api/auth/login').send({ email, password })).body.token;
    const res = await api.post('/api/auth/logout-others').set(bearer(token)).expect(200);
    await api.get('/api/me').set(bearer(other)).expect(401);
    await api.get('/api/me').set(bearer(res.body.token)).expect(200);
  });
});

describe('recuperación de contraseña', () => {
  it('envía el enlace, permite cambiarla una sola vez y revoca sesiones', async () => {
    const { api, mailer } = makeApp();
    const { token, email } = await registerUser(api);
    const res = await api.post('/api/auth/forgot-password').send({ email }).expect(200);
    expect(res.body.ok).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    const link = new URL(mailer.sent[0].link);
    expect(link.origin).toBe('https://api.example.com');
    expect(link.pathname).toBe('/reset');
    const resetToken = link.searchParams.get('token') as string;

    const page = await api.get(`/reset?token=${resetToken}`).expect(200);
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.text).toContain('name="token"');

    await api.post('/reset').type('form').send({ token: resetToken, next: 'corta' }).expect(400);
    await api.post('/reset').type('form').send({ token: resetToken, next: 'Recuperada-123' }).expect(200);
    await api.post('/reset').type('form').send({ token: resetToken, next: 'Otra-Vez-123' }).expect(400);

    await api.get('/api/me').set(bearer(token)).expect(401);
    await api.post('/api/auth/login').send({ email, password: 'Recuperada-123' }).expect(200);
  });

  it('no revela si el correo existe', async () => {
    const { api, mailer } = makeApp();
    const res = await api.post('/api/auth/forgot-password').send({ email: 'nadie@example.com' }).expect(200);
    expect(res.body.ok).toBe(true);
    expect(mailer.sent).toHaveLength(0);
  });

  it('rechaza enlaces caducados', async () => {
    const { api, mailer } = makeApp();
    const { email, user } = await registerUser(api);
    await api.post('/api/auth/forgot-password').send({ email });
    const resetToken = new URL(mailer.sent[0].link).searchParams.get('token') as string;
    await db.exec('UPDATE "User" SET "resetExpires" = $2 WHERE "id" = $1', [user.id, new Date(Date.now() - 1000)]);
    const res = await api.post('/reset').type('form').send({ token: resetToken, next: 'Recuperada-123' }).expect(400);
    expect(res.text).toContain('caducó');
  });
});

describe('reglas de contraseña', () => {
  const weak = 'solominusculas';
  it('las contraseñas nuevas necesitan mayúscula, minúscula y número', async () => {
    const { api, mailer } = makeApp();
    const v1 = await api.post('/api/auth/register').send({ email: 'debil1@example.com', password: weak }).expect(400);
    expect(v1.body.error).toMatch(/mayúscula, una minúscula y un número/);
    await api.post('/api/v2/auth/register').send({ email: 'debil2@example.com', password: weak }).expect(400);

    const { token, email, password } = await registerUser(api);
    const change = await api.post('/api/auth/change-password').set(bearer(token)).send({ current: password, next: weak }).expect(400);
    expect(change.body.error).toMatch(/mayúscula/);

    await api.post('/api/auth/forgot-password').send({ email });
    const resetToken = new URL(mailer.sent[0].link).searchParams.get('token') as string;
    const page = await api.post('/reset').type('form').send({ token: resetToken, next: weak }).expect(400);
    expect(page.text).toContain('mayúscula');
  });

  it('una cuenta antigua con contraseña sencilla sigue entrando', async () => {
    const { api } = makeApp();
    const { user } = await registerUser(api);
    const bcrypt = (await import('bcryptjs')).default;
    await db.exec('UPDATE "User" SET "passwordHash" = $2 WHERE "id" = $1', [user.id, await bcrypt.hash('12345678', 4)]);
    await api.post('/api/auth/login').send({ email: user.email, password: '12345678' }).expect(200);
  });

  it('la página para elegir contraseña usa el diseño de la app y su script está permitido por hash', async () => {
    const { api } = makeApp();
    const res = await api.get('/reset?token=abc').expect(200);
    expect(res.text).toContain('Design Your Core');
    expect(res.text).not.toMatch(/◉|✅|⚠️|#22C77E/);
    expect(res.headers['content-security-policy']).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
  });
});

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { fetchPublicPage, isPublicAddress } from '../src/lib/fetchPage.js';
import request from 'supertest';
import { db, fakeMailer, resetDb, testConfig } from './helpers.js';

const pages: Record<string, { status: number; body: string }> = {
  'https://www.youtube.com/watch?v=abcdefghijk&hl=es': { status: 200, body: '..."lengthSeconds":"3725",...' },
  'https://api.coursera.org/api/courses.v1?q=slug&slug=ml&fields=workload': { status: 200, body: JSON.stringify({ elements: [{ workload: 'Aproximadamente 20 horas' }] }) },
  'https://www.udemy.com/api-2.0/courses/ingles/?fields[course]=content_info,estimated_content_length': { status: 403, body: 'cloudflare' },
  'https://www.udemy.com/course/ingles/': { status: 200, body: '<div>12,5 horas de contenido</div>' },
  'https://ejemplo.com/curso': { status: 200, body: '<p>hola</p>' },
};
const asked: string[] = [];
const app = createApp({
  db,
  config: testConfig(),
  mailer: fakeMailer(),
  limits: { general: 10_000, strict: 10_000 },
  fetchPage: async (url) => {
    asked.push(url);
    if (url.includes('caida')) throw new Error('ECONNREFUSED');
    return pages[url] ?? { status: 404, body: '' };
  },
});
const api = request(app);

describe('duración de un curso con su enlace', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    const r = await api.post('/api/v2/auth/register').send({ email: `largo${Date.now()}@example.com`, password: 'Prueba1234', name: 'Ana' });
    token = r.body.accessToken;
  });
  afterAll(() => undefined);

  it('pide sesión', async () => {
    expect((await api.post('/api/v2/courses/length').send({ url: 'https://youtu.be/abcdefghijk' })).status).toBe(401);
  });

  it('lee YouTube, Coursera, Udemy (con la página si la API falla) y dice cuando no se puede', async () => {
    const ask = (url: string) => api.post('/api/v2/courses/length').set('authorization', `Bearer ${token}`).send({ url });
    expect((await ask('https://youtu.be/abcdefghijk')).body).toEqual({ seconds: 3725, exact: true });
    expect((await ask('https://www.coursera.org/learn/ml')).body).toEqual({ seconds: 72000, exact: false });
    expect((await ask('https://www.udemy.com/course/ingles/')).body).toEqual({ seconds: 45000, exact: false });
    const none = await ask('https://ejemplo.com/curso');
    expect(none.status).toBe(404);
    expect(none.body.error).toMatch(/a mano/);
    expect((await ask('https://caida.example.com/x')).status).toBe(502);
    expect((await ask('javascript:alert(1)')).status).toBe(400);
    expect((await ask('')).status).toBe(400);
  });
});

describe('solo direcciones públicas', () => {
  it('rechaza la red local y el propio servidor', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1']) expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ['8.8.8.8', '142.250.72.14', '2607:f8b0:4005:80b::200e']) expect(isPublicAddress(ip), ip).toBe(true);
  });

  it('no descarga nada de la red local aunque el nombre lo esconda', async () => {
    await expect(fetchPublicPage('http://127.0.0.1:1/x')).rejects.toThrow(/no permitida/);
    await expect(fetchPublicPage('http://localhost:1/x')).rejects.toThrow(/no permitida/);
    await expect(fetchPublicPage('file:///etc/passwd')).rejects.toThrow(/http/);
  });
});

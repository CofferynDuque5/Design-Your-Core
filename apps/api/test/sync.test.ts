import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, makeApp, prisma, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('sincronización del documento', () => {
  it('guarda y devuelve el estado completo', async () => {
    const { api } = makeApp();
    const { token } = await registerUser(api);
    const empty = await api.get('/api/sync').set(bearer(token)).expect(200);
    expect(empty.body.data).toEqual({});

    const data = { habits: [{ id: 'h1', label: 'Caminar', done: true, streak: 3 }], sleep: [{ date: '2026-09-23', quality: 4 }] };
    const put = await api.put('/api/sync').set(bearer(token)).send({ data }).expect(200);
    expect(put.body.ok).toBe(true);

    const got = await api.get('/api/sync').set(bearer(token)).expect(200);
    expect(got.body.data).toEqual(data);
    expect(got.body.updatedAt).toBeTruthy();
  });

  it('rechaza datos que no son un objeto', async () => {
    const { api } = makeApp();
    const { token } = await registerUser(api);
    await api.put('/api/sync').set(bearer(token)).send({ data: [1, 2] }).expect(400);
    await api.put('/api/sync').set(bearer(token)).send({ data: null }).expect(400);
  });

  it('cada persona solo ve su propio documento', async () => {
    const { api } = makeApp();
    const a = await registerUser(api);
    const b = await registerUser(api);
    await api.put('/api/sync').set(bearer(a.token)).send({ data: { secreto: 'de A' } }).expect(200);
    const got = await api.get('/api/sync').set(bearer(b.token)).expect(200);
    expect(got.body.data).toEqual({});
  });
});

describe('imágenes', () => {
  const img = (s: string) => `data:image/png;base64,${Buffer.from(s).toString('base64')}`;

  it('sube, lista y descarga imágenes propias', async () => {
    const { api } = makeApp();
    const { token } = await registerUser(api);
    const up = await api.post('/api/images').set(bearer(token)).send({ images: { a1: img('uno'), b2: img('dos'), 'mal id!': img('x'), c3: 'no-es-data-url' } }).expect(200);
    expect(up.body.count).toBe(2);
    const list = await api.get('/api/images').set(bearer(token)).expect(200);
    expect(list.body.ids.sort()).toEqual(['a1', 'b2']);
    const got = await api.post('/api/images/fetch').set(bearer(token)).send({ ids: ['a1', 'zz'] }).expect(200);
    expect(got.body.images).toEqual({ a1: img('uno') });
  });

  it('no permite sobrescribir ni leer imágenes de otra persona', async () => {
    const { api } = makeApp();
    const a = await registerUser(api);
    const b = await registerUser(api);
    await api.post('/api/images').set(bearer(a.token)).send({ images: { compartido: img('original de A') } }).expect(200);

    const attack = await api.post('/api/images').set(bearer(b.token)).send({ images: { compartido: img('pisado por B') } }).expect(200);
    expect(attack.body.count).toBe(0);
    const row = await prisma.image.findUniqueOrThrow({ where: { id: 'compartido' } });
    expect(row.data).toBe(img('original de A'));

    const peek = await api.post('/api/images/fetch').set(bearer(b.token)).send({ ids: ['compartido'] }).expect(200);
    expect(peek.body.images).toEqual({});
  });
});

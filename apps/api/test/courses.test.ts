import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clearCoursesCache } from '../src/db/courses.js';
import { bearer, db, makeApp, registerUser, resetDb } from './helpers.js';

beforeEach(async () => {
  await resetDb();
  clearCoursesCache();
});
afterAll(() => db.close());

const course = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  topic: 'Inglés',
  title: `Curso ${id}`,
  url: '',
  status: 'pendiente',
  notes: '',
  lessons: [{ id: `${id}l1`, title: 'Lección 1', done: false }],
  ...extra,
});

async function setup() {
  const ctx = makeApp();
  const u = await registerUser(ctx.api);
  const auth = bearer(u.token);
  const userId = (await db.row<{ id: string }>('SELECT "id" FROM "User" ORDER BY "createdAt" DESC LIMIT 1'))!.id;
  const get = async () => (await ctx.api.get('/api/v2/modules').set(auth).expect(200)).body as { data: Record<string, unknown>; updatedAt: string };
  const blobData = async () => (await db.row<{ data: Record<string, unknown> }>('SELECT "data" FROM "Blob" WHERE "userId" = $1', [userId]))!.data;
  const rows = () => db.rows<{ key: string; itemId: string; data: Record<string, unknown> }>('SELECT * FROM "CourseItem" WHERE "userId" = $1 ORDER BY "pos"', [userId]);
  return { ...ctx, auth, userId, get, blobData, rows };
}

describe('cursos en su propia tabla', () => {
  it('mueve los cursos que siguen dentro del documento sin perder nada', async () => {
    const { userId, get, blobData, rows } = await setup();
    const legacy = {
      courses: [course('a', { campoDesconocido: { x: 1 } }), course('b'), { roto: true }, course('a', { title: 'repetido' })],
      todos: [{ id: 't1', title: 'Hola', done: false }],
      claveFutura: [1, 2],
    };
    // Documento como lo dejaría una app antigua o una copia desde otra base.
    await db.exec('UPDATE "Blob" SET "data" = $2::jsonb WHERE "userId" = $1', [userId, JSON.stringify(legacy)]);

    const { data } = await get();
    expect(data).toEqual(legacy);
    expect(await blobData()).toEqual({ todos: legacy.todos, claveFutura: [1, 2] });
    expect((await rows()).length).toBe(4);
    const backup = await db.row<{ data: unknown }>('SELECT "data" FROM "BlobBackup" WHERE "userId" = $1', [userId]);
    expect(backup?.data).toEqual(legacy);
    // Una segunda lectura no vuelve a mover nada.
    expect((await get()).data).toEqual(legacy);
    expect((await db.rows('SELECT 1 FROM "BlobBackup" WHERE "userId" = $1', [userId])).length).toBe(1);
  });

  it('añade, cambia, reordena y borra cursos tocando solo su fila', async () => {
    const { api, auth, get, blobData, rows } = await setup();
    await api.post('/api/v2/modules/todos').set(auth).send({ item: { id: 't1', title: 'Tarea' } }).expect(201);
    for (const id of ['a', 'b', 'c']) await api.post('/api/v2/modules/courses').set(auth).send({ item: course(id) }).expect(201);
    await api.post('/api/v2/modules/courses').set(auth).send({ item: course('a') }).expect(409);

    const patched = await api.patch('/api/v2/modules/courses/b').set(auth).send({ status: 'curso', lessons: [{ id: 'bl1', title: 'Lección 1', done: true }] }).expect(200);
    expect(patched.body.item).toMatchObject({ id: 'b', status: 'curso', title: 'Curso b' });
    expect(patched.body.item.lessons[0]).toEqual({ id: 'bl1', title: 'Lección 1', done: true });
    await api.patch('/api/v2/modules/courses/zz').set(auth).send({ status: 'hecho' }).expect(404);

    await api.put('/api/v2/modules/courses/order').set(auth).send({ ids: ['c', 'a'] }).expect(200);
    let doc = (await get()).data;
    expect((doc.courses as Array<{ id: string }>).map((c) => c.id)).toEqual(['c', 'a', 'b']);

    await api.delete('/api/v2/modules/courses/a').set(auth).expect(200);
    await api.delete('/api/v2/modules/courses/a').set(auth).expect(404);
    doc = (await get()).data;
    expect((doc.courses as Array<{ id: string }>).map((c) => c.id)).toEqual(['c', 'b']);
    expect(doc.todos).toHaveLength(1);
    // El documento de Blob nunca vuelve a tener los cursos.
    expect(await blobData()).not.toHaveProperty('courses');
    expect((await rows()).map((r) => r.key)).toEqual(['c', 'b']);
  });

  it('la caché en memoria sigue los cambios y se renueva si otro proceso escribe', async () => {
    const { api, auth, userId, get } = await setup();
    await api.post('/api/v2/modules/courses').set(auth).send({ item: course('a') }).expect(201);
    const first = await get();
    expect((first.data.courses as unknown[]).length).toBe(1);
    await api.post('/api/v2/modules/courses').set(auth).send({ item: course('b') }).expect(201);
    await api.patch('/api/v2/modules/courses/a').set(auth).send({ title: 'Nuevo nombre' }).expect(200);
    const after = await get();
    expect((after.data.courses as Array<{ title: string }>).map((c) => c.title)).toEqual(['Nuevo nombre', 'Curso b']);
    expect(after.updatedAt).not.toBe(first.updatedAt);

    // Otro proceso cambia la base: sube coursesRev y la caché se descarta.
    await db.exec(`UPDATE "CourseItem" SET "data" = jsonb_set("data", '{title}', '"Desde otro proceso"') WHERE "userId" = $1 AND "key" = 'b'`, [userId]);
    await db.exec('UPDATE "Blob" SET "coursesRev" = "coursesRev" + 1 WHERE "userId" = $1', [userId]);
    const other = await get();
    expect((other.data.courses as Array<{ title: string }>)[1].title).toBe('Desde otro proceso');
  });

  it('PUT /api/sync guarda los cursos en su tabla y los conserva si no vienen', async () => {
    const { api, auth, get, blobData } = await setup();
    const doc = { courses: [course('a'), course('b')], notes: [] };
    await api.put('/api/sync').set(auth).send({ data: doc }).expect(200);
    expect(await blobData()).toEqual({ notes: [] });
    expect((await get()).data).toEqual(doc);

    await api.put('/api/sync').set(auth).send({ data: { notes: [{ id: 'n1' }] } }).expect(200);
    expect((await get()).data).toEqual({ courses: doc.courses, notes: [{ id: 'n1' }] });

    // Conflicto: responde con el documento completo, cursos incluidos.
    const stale = '2000-01-01T00:00:00.000Z';
    const res = await api.put('/api/sync').set(auth).send({ data: {}, baseUpdatedAt: stale }).expect(409);
    expect(res.body.data.courses).toHaveLength(2);

    const { updatedAt } = await get();
    await api.put('/api/sync').set(auth).send({ data: { courses: [course('c')] }, baseUpdatedAt: updatedAt }).expect(200);
    expect(((await get()).data.courses as Array<{ id: string }>).map((c) => c.id)).toEqual(['c']);
  });

  it('la exportación incluye los cursos', async () => {
    const { api, auth } = await setup();
    await api.post('/api/v2/modules/courses').set(auth).send({ item: course('a') }).expect(201);
    const res = await api.get('/api/v2/account/export').set(auth).expect(200);
    expect(res.body.legacy.courses).toHaveLength(1);
  });
});

describe('quitar cursos repetidos de una vez', () => {
  it('borra solo los pedidos, guarda copia y valida', async () => {
    const { api, auth, userId, get, rows } = await setup();
    for (const id of ['a', 'b', 'c']) await api.post('/api/v2/modules/courses').set(auth).send({ item: course(id) }).expect(201);
    await api.post('/api/v2/modules/courses/remove-many').set(auth).send({ ids: [] }).expect(400);
    const res = await api.post('/api/v2/modules/courses/remove-many').set(auth).send({ ids: ['a', 'c', 'no-existe'] }).expect(200);
    expect(res.body.removed).toBe(2);
    expect((await rows()).map((r) => r.itemId)).toEqual(['b']);
    expect(((await get()).data.courses as Array<{ id: string }>).map((c) => c.id)).toEqual(['b']);
    const backup = await db.row<{ data: { courses: Array<{ id: string }> } }>('SELECT "data" FROM "BlobBackup" WHERE "userId" = $1 AND "reason" = $2', [userId, 'cursos repetidos quitados']);
    expect(backup?.data.courses.map((c) => c.id)).toEqual(['a', 'c']);
  });
});

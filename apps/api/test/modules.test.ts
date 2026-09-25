import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, makeApp, prisma, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// Documento como lo deja la app anterior: claves conocidas, otras que la API
// v2 no toca y una desconocida que debe sobrevivir a cualquier escritura.
const OLD_DOC = {
  habits: [{ id: 'h1', label: 'Leer', icon: 'read', streak: 2, done: false, progress: 0 }],
  todos: [{ id: 'id_viejo1', title: 'Comprar pan', done: false }],
  subtasks: [],
  subjects: [{ id: 'mat1', name: 'Física', color: '#22B8CF', room: 'B-3', teacher: '', nextClass: '', topics: [] }],
  cycle: { cycleLength: 28, periodLength: 5 },
  claveFutura: { algo: [1, 2, 3] },
};

async function setup(doc: Record<string, unknown> | null = OLD_DOC) {
  const ctx = makeApp();
  const u = await registerUser(ctx.api);
  const auth = bearer(u.token);
  if (doc) await ctx.api.put('/api/sync').set(auth).send({ data: doc }).expect(200);
  const sync = async () => (await ctx.api.get('/api/sync').set(auth).expect(200)).body.data as Record<string, unknown>;
  return { ...ctx, auth, sync };
}

describe('v2 · módulos de la app anterior', () => {
  it('lee el mismo documento que /api/sync y exige sesión', async () => {
    const { api, auth } = await setup();
    const res = await api.get('/api/v2/modules').set(auth).expect(200);
    expect(res.body.data).toEqual(OLD_DOC);
    expect(res.body.updatedAt).toBeTruthy();
    await api.get('/api/v2/modules').expect(401);
    await api.post('/api/v2/modules/todos').send({ item: { id: 'a', title: 'x' } }).expect(401);
  });

  it('sin documento responde vacío y lo crea en la primera escritura', async () => {
    const { api, auth, sync } = await setup(null);
    await prisma.blob.deleteMany(); // el registro crea uno vacío; aquí se prueba sin él
    expect((await api.get('/api/v2/modules').set(auth).expect(200)).body).toEqual({ data: {}, updatedAt: null });
    const res = await api.post('/api/v2/modules/tasks').set(auth).send({ item: { id: 't1', title: 'Llamar' } }).expect(201);
    expect(res.body.item).toEqual({ id: 't1', title: 'Llamar', pri: 'media', time: null, rem: false, done: false, tags: '' });
    expect(res.body.updatedAt).toBeTruthy();
    expect(await sync()).toEqual({ tasks: [res.body.item] });
  });

  it('crea, edita y borra en cada clave conservando las demás', async () => {
    const { api, auth, sync } = await setup();
    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      ['blocks', { label: 'Estudiar', start: 9, dur: 1.5, kind: 'study' }, { label: 'Repasar', start: 10.5 }],
      ['tasks', { title: 'Entregar ensayo', pri: 'alta' }, { done: true, pri: 'baja' }],
      ['todos', { title: 'Lavar ropa' }, { title: 'Lavar y tender', done: true }],
      ['reminders', { day: 14, title: 'Dentista', when: '14:00', color: '#4F7CFF' }, { on: false, when: '15:00' }],
      ['classes', { day: 2, start: '08:00', end: '09:30', title: 'Cálculo', room: 'A-201', color: '#8B5CF6', subject: '' }, { end: '10:00', subject: 'mat1' }],
      ['focus', { mode: 'focus', seconds: 1500, dateKey: '2026-09-25' }, { seconds: 1200 }],
    ];
    for (const [key, item, patch] of cases) {
      const id = randomUUID();
      const created = await api.post(`/api/v2/modules/${key}`).set(auth).send({ item: { id, ...item } }).expect(201);
      expect(created.body.item).toMatchObject({ id, ...item });
      const updated = await api.patch(`/api/v2/modules/${key}/${id}`).set(auth).send(patch).expect(200);
      expect(updated.body.item).toMatchObject({ id, ...item, ...patch });
      const doc = await sync();
      expect(doc[key]).toContainEqual(updated.body.item);
      await api.delete(`/api/v2/modules/${key}/${id}`).set(auth).expect(200);
      expect(((await sync())[key] as Array<{ id: string }>).some((x) => x.id === id)).toBe(false);
    }
    const doc = await sync();
    expect(doc.habits).toEqual(OLD_DOC.habits);
    expect(doc.subjects).toEqual(OLD_DOC.subjects);
    expect(doc.cycle).toEqual(OLD_DOC.cycle);
    expect(doc.claveFutura).toEqual(OLD_DOC.claveFutura);
    expect(doc.todos).toEqual(OLD_DOC.todos);
  });

  it('valida cada formato y rechaza claves, ids y campos desconocidos', async () => {
    const { api, auth } = await setup();
    const bad: Array<[string, Record<string, unknown>]> = [
      ['reminders', { id: 'r1', day: 0, title: 'x' }],
      ['reminders', { id: 'r1', day: 5, title: 'x', color: '#000000' }],
      ['blocks', { id: 'b1', label: 'x', start: 8, dur: 1, kind: 'siesta' }],
      ['blocks', { id: 'b1', label: 'x', start: 22, dur: 3 }],
      ['tasks', { id: 't1', title: 'x', pri: 'urgente' }],
      ['classes', { id: 'c1', day: 1, start: '10:00', end: '10:00', title: 'x' }],
      ['classes', { id: 'c1', day: 1, start: '8:00', end: '10:00', title: 'x' }],
      ['classes', { id: 'c1', day: 1, start: '08:00', end: '10:00', title: 'x', subject: 'no-existe' }],
      ['focus', { id: 'f1', mode: 'focus', seconds: 1.5, dateKey: '2026-09-25' }],
      ['focus', { id: 'f1', mode: 'pausa', seconds: 10, dateKey: '2026-09-25' }],
      ['subtasks', { id: 's1', todoId: 'no-existe', title: 'x' }],
      ['todos', { id: 'a', title: '   ' }],
      ['todos', { id: 'a', title: 'x', prioridad: 1 }],
      ['todos', { title: 'sin id' }],
    ];
    for (const [key, item] of bad) {
      const res = await api.post(`/api/v2/modules/${key}`).set(auth).send({ item });
      expect(res.status, `${key} ${JSON.stringify(item)}`).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
    await api.post('/api/v2/modules/habits').set(auth).send({ item: { id: 'h9', label: 'x' } }).expect(404);
    await api.patch('/api/v2/modules/todos/no-existe').set(auth).send({ done: true }).expect(404);
    await api.delete('/api/v2/modules/todos/no-existe').set(auth).expect(404);
    await api.patch('/api/v2/modules/todos/id_viejo1').set(auth).send({ id: 'otro' }).expect(400);
    await api.post('/api/v2/modules/todos').set(auth).send({ item: { id: 'id_viejo1', title: 'Repetido' } }).expect(409);
  });

  it('un PATCH conserva los campos que la API no conoce y valida entre campos', async () => {
    const { api, auth, sync } = await setup({
      ...OLD_DOC,
      classes: [{ id: 'c1', day: 1, start: '08:00', end: '09:30', title: 'Cálculo', room: '', color: '#4F7CFF', subject: '', nota: 'de la app anterior' }],
      blocks: [{ id: 'b1', label: 'Leer', sub: '', start: 20, dur: 1, kind: 'read', extra: true }],
    });
    const res = await api.patch('/api/v2/modules/classes/c1').set(auth).send({ room: 'A-1' }).expect(200);
    expect(res.body.item).toMatchObject({ room: 'A-1', nota: 'de la app anterior' });
    await api.patch('/api/v2/modules/classes/c1').set(auth).send({ end: '07:00' }).expect(400);
    await api.patch('/api/v2/modules/blocks/b1').set(auth).send({ dur: 5 }).expect(400);
    await api.patch('/api/v2/modules/blocks/b1').set(auth).send({ dur: 2 }).expect(200);
    const doc = await sync();
    expect(doc.blocks).toEqual([{ id: 'b1', label: 'Leer', sub: '', start: 20, dur: 2, kind: 'read', extra: true }]);
    expect((doc.classes as unknown[])[0]).toMatchObject({ end: '09:30', nota: 'de la app anterior' });
  });

  it('borrar un pendiente borra sus subtareas', async () => {
    const { api, auth, sync } = await setup();
    await api.post('/api/v2/modules/todos').set(auth).send({ item: { id: 'td2', title: 'Mudanza' } }).expect(201);
    for (const [id, todoId] of [['s1', 'id_viejo1'], ['s2', 'td2'], ['s3', 'td2']]) {
      await api.post('/api/v2/modules/subtasks').set(auth).send({ item: { id, todoId, title: `Sub ${id}` } }).expect(201);
    }
    await api.patch('/api/v2/modules/subtasks/s2').set(auth).send({ done: true }).expect(200);
    await api.delete('/api/v2/modules/todos/td2').set(auth).expect(200);
    const doc = await sync();
    expect(doc.todos).toEqual(OLD_DOC.todos);
    expect(doc.subtasks).toEqual([{ id: 's1', todoId: 'id_viejo1', title: 'Sub s1', done: false }]);
  });

  it('reordena como la app anterior: los ids que faltan quedan al final', async () => {
    const { api, auth, sync } = await setup();
    for (const id of ['a', 'b', 'c']) await api.post('/api/v2/modules/todos').set(auth).send({ item: { id, title: id } }).expect(201);
    await api.put('/api/v2/modules/todos/order').set(auth).send({ ids: ['c', 'a', 'desconocido'] }).expect(200);
    expect(((await sync()).todos as Array<{ id: string }>).map((t) => t.id)).toEqual(['c', 'a', 'id_viejo1', 'b']);
    await api.put('/api/v2/modules/todos/order').set(auth).send({ ids: 'c' }).expect(400);
  });

  it('enfoque: la sesión más reciente primero y como mucho 500', async () => {
    const focus = Array.from({ length: 500 }, (_, i) => ({ id: `f${i}`, mode: 'focus', seconds: 60, dateKey: '2026-09-01' }));
    const { api, auth, sync } = await setup({ ...OLD_DOC, focus });
    await api.post('/api/v2/modules/focus').set(auth).send({ item: { id: 'nueva', mode: 'short', seconds: 300, dateKey: '2026-09-25' } }).expect(201);
    const list = (await sync()).focus as Array<{ id: string }>;
    expect(list).toHaveLength(500);
    expect(list[0].id).toBe('nueva');
    expect(list.at(-1)?.id).toBe('f498');
  });

  it('las escrituras simultáneas no pierden elementos', async () => {
    const { api, auth, sync } = await setup();
    const ids = Array.from({ length: 12 }, () => randomUUID());
    const results = await Promise.all(ids.map((id, i) => api.post(`/api/v2/modules/${i % 2 ? 'tasks' : 'todos'}`).set(auth).send({ item: { id, title: `Elemento ${i}` } })));
    expect(results.map((r) => r.status)).toEqual(ids.map(() => 201));
    const doc = await sync();
    const saved = [...(doc.todos as Array<{ id: string }>), ...(doc.tasks as Array<{ id: string }>)].map((x) => x.id);
    for (const id of ids) expect(saved).toContain(id);
    expect(doc.claveFutura).toEqual(OLD_DOC.claveFutura);
  });

  it('la app anterior sigue funcionando: ve los cambios y su PUT con baseUpdatedAt detecta la edición', async () => {
    const { api, auth, sync } = await setup();
    const base = (await api.get('/api/sync').set(auth)).body.updatedAt;
    const res = await api.post('/api/v2/modules/reminders').set(auth).send({ item: { id: 'r1', day: 3, title: 'Pagar renta' } }).expect(201);
    expect(res.body.updatedAt).not.toBe(base);
    expect((await sync()).reminders).toEqual([{ id: 'r1', day: 3, title: 'Pagar renta', when: '', color: '#0FA968', icon: 'doc', on: true }]);
    await api.put('/api/sync').set(auth).send({ data: { todos: [] }, baseUpdatedAt: base }).expect(409);
  });

  it('cada persona solo edita su documento', async () => {
    const { api, auth } = await setup();
    await api.post('/api/v2/modules/todos').set(auth).send({ item: { id: 'mio', title: 'Privado' } }).expect(201);
    const other = await registerUser(api);
    await api.patch('/api/v2/modules/todos/mio').set(bearer(other.token)).send({ done: true }).expect(404);
    await api.delete('/api/v2/modules/todos/mio').set(bearer(other.token)).expect(404);
  });
});

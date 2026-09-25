import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { noteTag } from '@dyc/core';
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

  it('tanda 2: crea, edita y borra materias, proyectos, roadmaps, cuadernos, contenido e ideas', async () => {
    const { api, auth, sync } = await setup();
    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      ['subjects', { name: 'Química', teacher: 'Prof. Ruiz', color: '#8B5CF6' }, { room: 'Lab 1', nextClass: 'Lunes 8:00' }],
      ['projects', { title: 'Ensayo de Historia', subject: 'Física', deadline: '20 SEP', color: '#22B8CF' }, { status: 'revision', deadline: '27 SEP' }],
      ['roadmaps', { name: 'Ingeniería de Sistemas', color: '#4F7CFF' }, { name: 'Ingeniería' }],
      ['notebooks', { title: 'Apuntes', category: 'Universidad', subject: 'Cálculo', topic: 'Derivadas', emoji: '🧮' }, { color: '#111827' }],
      ['content', { title: 'Probé 100 apps de IA', platform: 'tiktok' }, { stage: 'guion', script: '# Gancho', due: '12 sep' }],
      ['ideas', { title: 'App de hábitos', category: 'web' }, { body: 'Para estudiantes', tags: 'saas, urgente' }],
    ];
    for (const [key, item, patch] of cases) {
      const id = randomUUID();
      const created = await api.post(`/api/v2/modules/${key}`).set(auth).send({ item: { id, ...item } }).expect(201);
      expect(created.body.item).toMatchObject({ id, ...item });
      const updated = await api.patch(`/api/v2/modules/${key}/${id}`).set(auth).send(patch).expect(200);
      expect((await sync())[key]).toContainEqual({ ...created.body.item, ...patch });
      expect(updated.body.item).toEqual({ ...created.body.item, ...patch });
      await api.delete(`/api/v2/modules/${key}/${id}`).set(auth).expect(200);
    }
    const doc = await sync();
    expect(doc.subjects).toEqual(OLD_DOC.subjects);
    expect(doc.claveFutura).toEqual(OLD_DOC.claveFutura);
    expect(doc.habits).toEqual(OLD_DOC.habits);
  });

  it('temas, hitos y pasos se editan con la lista completa y conservan lo que la API no conoce', async () => {
    const { api, auth, sync } = await setup({
      ...OLD_DOC,
      subjects: [{ id: 'mat1', name: 'Física', color: '#22B8CF', room: 'B-3', teacher: '', nextClass: '', topics: [{ id: 'xab12cd', name: 'Ondas', done: false, nota: 'de la IA' }] }],
      projects: [{ id: 'id_p1', title: 'Maqueta', subject: 'Física', deadline: '20 SEP', status: 'curso', color: '#0FA968', milestones: [] }],
    });
    await api
      .patch('/api/v2/modules/subjects/mat1')
      .set(auth)
      .send({ topics: [{ id: 'xab12cd', name: 'Ondas', done: true }, { id: 't2', name: 'Óptica', done: false }] })
      .expect(200);
    await api.patch('/api/v2/modules/projects/id_p1').set(auth).send({ milestones: [{ id: 'm1', name: 'Boceto', done: true, date: '' }] }).expect(200);
    await api.post('/api/v2/modules/roadmaps').set(auth).send({ item: { id: 'r1', name: 'Ruta', steps: [{ id: 's1', name: 'Cálculo I' }] } }).expect(201);
    await api.patch('/api/v2/modules/roadmaps/r1').set(auth).send({ steps: [{ id: 's1', name: 'Cálculo I', done: true }, { id: 's2', name: 'Cálculo II', done: false }] }).expect(200);
    await api.patch('/api/v2/modules/subjects/mat1').set(auth).send({ topics: [{ id: 'x', name: 'x', done: 'sí' }] }).expect(400);
    const doc = await sync();
    expect((doc.subjects as Array<{ topics: unknown }>)[0].topics).toEqual([
      { id: 'xab12cd', name: 'Ondas', done: true, nota: 'de la IA' },
      { id: 't2', name: 'Óptica', done: false },
    ]);
    expect((doc.projects as Array<Record<string, unknown>>)[0]).toEqual({ id: 'id_p1', title: 'Maqueta', subject: 'Física', deadline: '20 SEP', status: 'curso', color: '#0FA968', milestones: [{ id: 'm1', name: 'Boceto', done: true, date: '' }] });
    expect(doc.roadmaps).toEqual([{ id: 'r1', name: 'Ruta', color: '#8B5CF6', steps: [{ id: 's1', name: 'Cálculo I', done: true }, { id: 's2', name: 'Cálculo II', done: false }] }]);
  });

  it('cuadernos: las cajitas exigen su cuaderno, guardan el lenguaje y se borran con él', async () => {
    const { api, auth, sync } = await setup();
    await api.post('/api/v2/modules/noteBoxes').set(auth).send({ item: { id: 'b0', notebookId: 'no-existe' } }).expect(400);
    await api.post('/api/v2/modules/notebooks').set(auth).send({ item: { id: 'n1', title: 'Cálculo' } }).expect(201);
    await api.post('/api/v2/modules/notebooks').set(auth).send({ item: { id: 'n2', title: 'Historia' } }).expect(201);
    const code = await api.post('/api/v2/modules/noteBoxes').set(auth).send({ item: { id: 'b1', notebookId: 'n1', kind: 'code', title: 'main.py' } }).expect(201);
    expect(code.body.item).toEqual({ id: 'b1', notebookId: 'n1', title: 'main.py', text: '', color: '#1e1e2e', kind: 'code', lang: 'js' });
    await api.post('/api/v2/modules/noteBoxes').set(auth).send({ item: { id: 'b2', notebookId: 'n2', text: 'Revolución francesa' } }).expect(201);
    // La app anterior no guardaba el cambio de lenguaje; aquí sí, en el mismo campo `lang`.
    await api.patch('/api/v2/modules/noteBoxes/b1').set(auth).send({ lang: 'python', text: 'print(1)' }).expect(200);
    await api.patch('/api/v2/modules/noteBoxes/b1').set(auth).send({ notebookId: 'no-existe' }).expect(400);
    expect((await sync()).noteBoxes).toContainEqual({ id: 'b1', notebookId: 'n1', title: 'main.py', text: 'print(1)', color: '#1e1e2e', kind: 'code', lang: 'python' });
    await api.delete('/api/v2/modules/notebooks/n1').set(auth).expect(200);
    const doc = await sync();
    expect((doc.notebooks as Array<{ id: string }>).map((n) => n.id)).toEqual(['n2']);
    expect((doc.noteBoxes as Array<{ id: string }>).map((b) => b.id)).toEqual(['b2']);
  });

  it('borrar una materia conserva sus clases y proyectos, como la app anterior', async () => {
    const { api, auth, sync } = await setup({
      ...OLD_DOC,
      classes: [{ id: 'c1', day: 1, start: '08:00', end: '09:30', title: 'Física', room: 'B-3', color: '#22B8CF', subject: 'mat1' }],
      projects: [{ id: 'p1', title: 'Maqueta', subject: 'Física', deadline: '', status: 'curso', color: '#22B8CF', milestones: [] }],
    });
    await api.delete('/api/v2/modules/subjects/mat1').set(auth).expect(200);
    const doc = await sync();
    expect(doc.subjects).toEqual([]);
    expect(doc.classes).toEqual([expect.objectContaining({ id: 'c1', subject: 'mat1' })]);
    expect(doc.projects).toEqual([expect.objectContaining({ id: 'p1', subject: 'Física' })]);
    // La clase sigue editándose en el Horario (sin tocar su materia o dejándola suelta).
    await api.patch('/api/v2/modules/classes/c1').set(auth).send({ room: 'B-4' }).expect(200);
    await api.patch('/api/v2/modules/classes/c1').set(auth).send({ subject: '' }).expect(200);
  });

  it('tanda 2: valida los formatos antiguos', async () => {
    const { api, auth } = await setup();
    const bad: Array<[string, Record<string, unknown>]> = [
      ['subjects', { id: 's', name: '' }],
      ['subjects', { id: 's', name: 'x', color: 'azul' }],
      ['projects', { id: 'p', title: 'x', status: 'hecho' }],
      ['projects', { id: 'p', title: 'x', milestones: [{ id: 'm', name: 'x', done: false, extra: 1 }] }],
      ['roadmaps', { id: 'r', name: 'x', steps: [{ name: 'sin id' }] }],
      ['notebooks', { id: 'n', title: 'x', emoji: '' }],
      ['noteBoxes', { id: 'b', notebookId: 'n', kind: 'imagen' }],
      ['content', { id: 'c', title: 'x', stage: 'subido' }],
      ['content', { id: 'c', title: 'x', platform: 'twitch' }],
      ['ideas', { id: 'i', title: 'x', category: 'ventas' }],
      ['ideas', { id: 'i', title: 'x', votos: 3 }],
    ];
    for (const [key, item] of bad) {
      const res = await api.post(`/api/v2/modules/${key}`).set(auth).send({ item });
      expect(res.status, `${key} ${JSON.stringify(item)}`).toBe(400);
    }
  });
  it('tanda 3: crea, edita y borra finanzas, metas, mascotas, ciclo, ejercicio, sueño, diario y rutina', async () => {
    const { api, auth, sync } = await setup();
    await api.post('/api/v2/modules/pets').set(auth).send({ item: { id: 'pet1', name: 'Luna' } }).expect(201);
    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      ['transactions', { date: '2026-09-25', amount: 12.5, category: 'Comida' }, { amount: 15, note: 'Mercado' }],
      ['goals', { title: 'Publicar 8 videos', target: 8, unit: 'videos', deadline: '2026-10-31', category: 'creador' }, { current: 8, done: true }],
      ['petCares', { petId: 'pet1', title: 'Darle de comer', time: '08:00' }, { lastDone: '2026-09-25', days: '135' }],
      ['period', { date: '2026-09-20', flow: 'heavy', symptoms: 'Cólicos, Fatiga', mood: '😣' }, { flow: 'light', note: 'Mejor' }],
      ['workouts', { date: '2026-09-25', plan: 'Full body', minutes: 30 }, { minutes: 35 }],
      ['sleep', { date: '2026-09-25', bedtime: '23:30', waketime: '07:15', quality: 4 }, { quality: 5, note: 'Sin pantallas' }],
      ['journal', { date: '2026-09-25', mood: '🙂', gratitude: 'Mi familia' }, { note: 'Buen día' }],
      ['routines', { title: 'Tomar vitaminas', time: '08:30', days: '12345' }, { enabled: false }],
      ['meals', { label: 'Desayuno', time: '08:00', dateKey: '2026-09-25' }, { note: 'Avena' }],
    ];
    for (const [key, item, patch] of cases) {
      const id = randomUUID();
      const created = await api.post(`/api/v2/modules/${key}`).set(auth).send({ item: { id, ...item } }).expect(201);
      expect(created.body.item).toMatchObject({ id, ...item });
      const updated = await api.patch(`/api/v2/modules/${key}/${id}`).set(auth).send(patch).expect(200);
      expect(updated.body.item).toEqual({ ...created.body.item, ...patch });
      expect((await sync())[key]).toContainEqual(updated.body.item);
      await api.delete(`/api/v2/modules/${key}/${id}`).set(auth).expect(200);
    }
    const doc = await sync();
    expect(doc.claveFutura).toEqual(OLD_DOC.claveFutura);
    expect(doc.habits).toEqual(OLD_DOC.habits);
    expect(doc.cycle).toEqual(OLD_DOC.cycle);
  });

  it('tanda 3: valores por defecto y formatos de la app anterior', async () => {
    const { api, auth } = await setup();
    const post = async (key: string, item: Record<string, unknown>) => (await api.post(`/api/v2/modules/${key}`).set(auth).send({ item }).expect(201)).body.item;
    expect(await post('transactions', { id: 't1', date: '2026-09-25', amount: 10 })).toEqual({ id: 't1', date: '2026-09-25', amount: 10, type: 'expense', category: 'Otro', note: '' });
    expect(await post('goals', { id: 'g1', title: 'Leer' })).toEqual({ id: 'g1', title: 'Leer', target: 10, current: 0, unit: '', deadline: '', category: 'personal', done: false });
    expect(await post('pets', { id: 'p1', name: 'Toby' })).toEqual({ id: 'p1', name: 'Toby', species: 'dog', note: '' });
    expect(await post('petCares', { id: 'c1', petId: 'p1', title: 'Paseo' })).toEqual({ id: 'c1', petId: 'p1', kind: 'comida', title: 'Paseo', time: '', days: '1234567', sound: true, enabled: true, lastDone: '' });
    expect(await post('period', { id: 'd1', date: '2026-09-20' })).toEqual({ id: 'd1', date: '2026-09-20', flow: 'medium', symptoms: '', mood: '', note: '' });
    expect(await post('routines', { id: 'r1', title: 'Agua', time: '10:00' })).toEqual({ id: 'r1', title: 'Agua', time: '10:00', days: '1234567', icon: 'bell', sound: true, enabled: true });
    expect(await post('meals', { id: 'm1', dateKey: '2026-09-25' })).toEqual({ id: 'm1', label: 'Comida', time: '', note: '', dateKey: '2026-09-25' });
    const bad: Array<[string, Record<string, unknown>]> = [
      ['transactions', { id: 'x', date: '2026-09-25', amount: -5 }],
      ['transactions', { id: 'x', date: '25/09/2026', amount: 5 }],
      ['transactions', { id: 'x', date: '2026-09-25', amount: 5, type: 'gasto' }],
      ['goals', { id: 'x', title: 'x', target: 0 }],
      ['goals', { id: 'x', title: 'x', category: 'viajes' }],
      ['goals', { id: 'x', title: 'x', deadline: 'mañana' }],
      ['pets', { id: 'x', name: '  ' }],
      ['pets', { id: 'x', name: 'x', species: 'dragon' }],
      ['petCares', { id: 'x', petId: 'no-existe', title: 'x' }],
      ['petCares', { id: 'x', petId: 'p1', title: 'x', days: '1238' }],
      ['petCares', { id: 'x', petId: 'p1', title: 'x', days: '112' }],
      ['period', { id: 'x', date: '2026-09-21', flow: 'poco' }],
      ['workouts', { id: 'x', date: '2026-09-25', plan: 'x', minutes: 0 }],
      ['sleep', { id: 'x', date: '2026-09-25', bedtime: '23:00', waketime: '7:00' }],
      ['sleep', { id: 'x', date: '2026-09-25', bedtime: '23:00', waketime: '07:00', quality: 6 }],
      ['routines', { id: 'x', title: 'x', time: '25:00' }],
      ['meals', { id: 'x', dateKey: '2026-09-25', extra: 1 }],
    ];
    for (const [key, item] of bad) {
      const res = await api.post(`/api/v2/modules/${key}`).set(auth).send({ item });
      expect(res.status, `${key} ${JSON.stringify(item)}`).toBe(400);
    }
  });

  it('tanda 3: lo más reciente primero con su máximo y un registro por fecha', async () => {
    const transactions = Array.from({ length: 2000 }, (_, i) => ({ id: `t${i}`, date: '2026-09-01', amount: 1, type: 'expense', category: 'Otro', note: '' }));
    const { api, auth, sync } = await setup({ ...OLD_DOC, transactions });
    await api.post('/api/v2/modules/transactions').set(auth).send({ item: { id: 'nuevo', date: '2026-09-25', amount: 3 } }).expect(201);
    const list = (await sync()).transactions as Array<{ id: string }>;
    expect(list).toHaveLength(2000);
    expect(list[0].id).toBe('nuevo');
    for (const key of ['workouts', 'sleep']) {
      const item = key === 'workouts' ? { date: '2026-09-25', plan: 'Core express', minutes: 15 } : { date: '2026-09-25', bedtime: '23:00', waketime: '07:00' };
      await api.post(`/api/v2/modules/${key}`).set(auth).send({ item: { id: `${key}1`, ...item } }).expect(201);
      await api.post(`/api/v2/modules/${key}`).set(auth).send({ item: { id: `${key}2`, ...item } }).expect(201);
      expect(((await sync())[key] as Array<{ id: string }>).map((x) => x.id)).toEqual([`${key}2`, `${key}1`]);
    }
    await api.post('/api/v2/modules/period').set(auth).send({ item: { id: 'd1', date: '2026-09-20' } }).expect(201);
    await api.post('/api/v2/modules/period').set(auth).send({ item: { id: 'd2', date: '2026-09-21' } }).expect(201);
    expect((await api.post('/api/v2/modules/period').set(auth).send({ item: { id: 'd3', date: '2026-09-20' } }).expect(409)).body.error).toBe('Ese día ya está registrado');
    await api.patch('/api/v2/modules/period/d2').set(auth).send({ date: '2026-09-20' }).expect(409);
    await api.patch('/api/v2/modules/period/d2').set(auth).send({ date: '2026-09-22', flow: 'light' }).expect(200);
    await api.post('/api/v2/modules/journal').set(auth).send({ item: { id: 'j1', date: '2026-09-25' } }).expect(201);
    await api.post('/api/v2/modules/journal').set(auth).send({ item: { id: 'j2', date: '2026-09-25' } }).expect(409);
    await api.patch('/api/v2/modules/journal/j1').set(auth).send({ note: 'Hoy', date: '2026-09-25' }).expect(200);
  });

  it('tanda 3: borrar una mascota borra sus cuidados', async () => {
    const { api, auth, sync } = await setup();
    for (const id of ['luna', 'toby']) await api.post('/api/v2/modules/pets').set(auth).send({ item: { id, name: id } }).expect(201);
    await api.post('/api/v2/modules/petCares').set(auth).send({ item: { id: 'c1', petId: 'luna', title: 'Comida' } }).expect(201);
    await api.post('/api/v2/modules/petCares').set(auth).send({ item: { id: 'c2', petId: 'toby', title: 'Paseo', kind: 'paseo' } }).expect(201);
    await api.patch('/api/v2/modules/petCares/c2').set(auth).send({ petId: 'nadie' }).expect(400);
    await api.delete('/api/v2/modules/pets/luna').set(auth).expect(200);
    const doc = await sync();
    expect((doc.pets as Array<{ id: string }>).map((p) => p.id)).toEqual(['toby']);
    expect((doc.petCares as Array<{ id: string }>).map((c) => c.id)).toEqual(['c2']);
  });

  it('objetos cycle, dayLog y budget: PUT completo y PATCH parcial, conservando el resto', async () => {
    const { api, auth, sync } = await setup({ ...OLD_DOC, cycle: { cycleLength: 28, periodLength: 5, notaVieja: 1 }, dayLog: { dateKey: '2026-09-24', water: 5, waterGoal: 8 } });
    let res = await api.patch('/api/v2/modules/cycle').set(auth).send({ cycleLength: 30 }).expect(200);
    expect(res.body.value).toEqual({ cycleLength: 30, periodLength: 5, notaVieja: 1 });
    expect(res.body.updatedAt).toBeTruthy();
    res = await api.put('/api/v2/modules/cycle').set(auth).send({ cycleLength: 26 }).expect(200);
    expect(res.body.value).toEqual({ cycleLength: 26, periodLength: 5, notaVieja: 1 });
    await api.patch('/api/v2/modules/cycle').set(auth).send({ cycleLength: 14 }).expect(400);
    await api.patch('/api/v2/modules/cycle').set(auth).send({ periodLength: 15 }).expect(400);
    await api.patch('/api/v2/modules/cycle').set(auth).send({ otra: 1 }).expect(400);
    await api.patch('/api/v2/modules/dayLog').set(auth).send({ dateKey: '2026-09-25', water: 1 }).expect(200);
    await api.patch('/api/v2/modules/dayLog').set(auth).send({ water: 41 }).expect(400);
    await api.put('/api/v2/modules/dayLog').set(auth).send({ water: 2 }).expect(400); // falta dateKey
    await api.patch('/api/v2/modules/budget').set(auth).send({ monthly: 1500.5 }).expect(200);
    await api.put('/api/v2/modules/budget').set(auth).send({ monthly: -1 }).expect(400);
    await api.patch('/api/v2/modules/todos').set(auth).send({ title: 'x' }).expect(404);
    await api.put('/api/v2/modules/habits').set(auth).send({}).expect(404);
    await api.post('/api/v2/modules/cycle').set(auth).send({ item: { id: 'x' } }).expect(404);
    const doc = await sync();
    expect(doc.cycle).toEqual({ cycleLength: 26, periodLength: 5, notaVieja: 1 });
    expect(doc.dayLog).toEqual({ dateKey: '2026-09-25', water: 1, waterGoal: 8 });
    expect(doc.budget).toEqual({ monthly: 1500.5 });
    expect(doc.claveFutura).toEqual(OLD_DOC.claveFutura);
    expect(doc.todos).toEqual(OLD_DOC.todos);
  });

  it('un objeto que falta se crea con los valores por defecto de la app anterior', async () => {
    const { api, auth, sync } = await setup({ todos: [] });
    const res = await api.patch('/api/v2/modules/cycle').set(auth).send({ periodLength: 4 }).expect(200);
    expect(res.body.value).toEqual({ cycleLength: 28, periodLength: 4 });
    expect((await sync()).cycle).toEqual({ cycleLength: 28, periodLength: 4 });
  });

  it('mostrar Ciclo es un ajuste de la cuenta que ve también la app anterior', async () => {
    const { api, auth } = await setup();
    expect((await api.get('/api/me').set(auth).expect(200)).body.user.showCycle).toBe(false);
    const res = await api.patch('/api/v2/me').set(auth).send({ showCycle: true }).expect(200);
    expect(res.body.user).toMatchObject({ showCycle: true });
    expect((await api.get('/api/me').set(auth).expect(200)).body.user.showCycle).toBe(true);
    await api.patch('/api/v2/me').set(auth).send({ showCycle: 'sí' }).expect(400);
    await api.patch('/api/v2/me').set(auth).send({ showCycle: true, name: 'Otra' }).expect(400);
    await api.patch('/api/v2/me').send({ showCycle: false }).expect(401);
  });

  it('tanda 4: notas con extracto y color derivados, trabajo y respiración', async () => {
    const shared = { id: 'n0', title: 'Vieja', subject: 'Física', date: '3 sept', tag: '#8B5CF6', excerpt: 'Hola', body: 'Hola', commit: false, tags: '', shareId: 'abc123defg', extraVieja: 1 };
    const { api, auth, sync } = await setup({ ...OLD_DOC, notes: [shared] });
    const post = async (key: string, item: Record<string, unknown>) => (await api.post(`/api/v2/modules/${key}`).set(auth).send({ item }).expect(201)).body.item;
    const body = `# Ondas\n${'á'.repeat(120)}`;
    const note = await post('notes', { id: 'n1', subject: 'Física', date: '25 sept', body, tags: 'examen, física' });
    expect(note).toEqual({ id: 'n1', title: 'Nota sin título', subject: 'Física', date: '25 sept', tag: noteTag('Física'), excerpt: body.slice(0, 90), body, commit: false, tags: 'examen, física', shareId: null });
    let res = await api.patch('/api/v2/modules/notes/n0').set(auth).send({ body: 'Texto nuevo', subject: 'Química' }).expect(200);
    // El enlace público y los campos desconocidos se conservan; extracto y color se recalculan.
    expect(res.body.item).toEqual({ ...shared, body: 'Texto nuevo', excerpt: 'Texto nuevo', subject: 'Química', tag: noteTag('Química') });
    await api.patch('/api/v2/modules/notes/n0').set(auth).send({ shareId: null }).expect(400);
    await api.patch('/api/v2/modules/notes/n0').set(auth).send({ excerpt: 'x' }).expect(400);
    expect(await post('notes', { id: 'n2', tag: '#000000', excerpt: 'otro', body: 'Hola' })).toMatchObject({ subject: 'General', tag: noteTag('General'), excerpt: 'Hola' });
    await api.post('/api/v2/modules/notes').set(auth).send({ item: { id: 'n3', tag: 'x'.repeat(30) } }).expect(400);
    // Una imagen incrustada en base64 (como hacía la app anterior sin IndexedDB) cabe en el cuerpo.
    const img = `![imagen](data:image/jpeg;base64,${'A'.repeat(500_000)})`;
    res = await api.patch('/api/v2/modules/notes/n1').set(auth).send({ body: img }).expect(200);
    expect(res.body.item.excerpt).toBe(img.slice(0, 90));

    expect(await post('workItems', { id: 'w1', title: 'Informe' })).toEqual({ id: 'w1', title: 'Informe', project: 'p1', status: 'todo', done: false, due: '' });
    await api.patch('/api/v2/modules/workItems/w1').set(auth).send({ status: 'curso', project: 'p3', due: 'Hoy' }).expect(200);
    await api.patch('/api/v2/modules/workItems/w1').set(auth).send({ project: 'otro' }).expect(400);

    const meditations = Array.from({ length: 400 }, (_, i) => ({ id: `m${i}`, date: '2026-09-01', minutes: 1, kind: 'respiracion' }));
    const before = await sync();
    await api.put('/api/sync').set(auth).send({ data: { ...before, meditations } }).expect(200);
    expect(await post('meditations', { id: 'nueva', date: '2026-09-25', minutes: 3 })).toEqual({ id: 'nueva', date: '2026-09-25', minutes: 3, kind: 'respiracion' });
    const doc = await sync();
    expect((doc.meditations as Array<{ id: string }>).map((m) => m.id).slice(0, 2)).toEqual(['nueva', 'm0']);
    expect(doc.meditations).toHaveLength(400);
    expect(doc.workItems).toEqual([{ id: 'w1', title: 'Informe', project: 'p3', status: 'curso', done: false, due: 'Hoy' }]);
    expect(doc.claveFutura).toEqual(OLD_DOC.claveFutura);
  });

  it('bóveda cifrada: el servidor solo guarda datos cifrados con su forma y migra la lista antigua a petición', async () => {
    const legacyVault = [
      { id: 'v1', name: 'Banco', mono: 'BA', user: 'ana', pass: 'secreta-1' },
      { id: 'v2', name: 'Correo', mono: 'CO', user: 'ana@x.com', pass: 'secreta-2' },
      { id: 'v3', name: 'Añadida después', mono: 'AD', user: '', pass: 'otra' },
    ];
    const { api, auth, sync } = await setup({ ...OLD_DOC, vault: legacyVault });
    const b64 = (n: number, fill = 7) => Buffer.from(new Uint8Array(n).fill(fill)).toString('base64');
    const item = (id: string, fill = 1) => ({ id, iv: b64(12, fill), ct: b64(64, fill) });
    const vault = { v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: b64(16) }, check: { iv: b64(12), ct: b64(40) }, items: [] };

    await api.post('/api/v2/modules/vaultSecure/items').set(auth).send({ item: item('a') }).expect(404);
    await api.put('/api/v2/modules/vaultSecure').send(vault).expect(401);
    await api.put('/api/v2/modules/vaultSecure').set(auth).send({ ...vault, kdf: { ...vault.kdf, iterations: 1000 } }).expect(400);
    await api.put('/api/v2/modules/vaultSecure').set(auth).send({ ...vault, items: [{ id: 'a', name: 'Banco', pass: 'x' }] }).expect(400);
    expect((await api.put('/api/v2/modules/vaultSecure').set(auth).send(vault).expect(201)).body.value).toEqual(vault);
    // Nunca sustituye una bóveda que ya existe.
    await api.put('/api/v2/modules/vaultSecure').set(auth).send(vault).expect(409);
    await api.patch('/api/v2/modules/vaultSecure').set(auth).send({ v: 1 }).expect(404);
    await api.post('/api/v2/modules/vault').set(auth).send({ item: { id: 'x', name: 'x', pass: 'x' } }).expect(404);

    await api.post('/api/v2/modules/vaultSecure/items').set(auth).send({ item: item('a') }).expect(201);
    await api.post('/api/v2/modules/vaultSecure/items').set(auth).send({ item: item('a') }).expect(409);
    await api.post('/api/v2/modules/vaultSecure/items').set(auth).send({ item: { ...item('b'), user: 'ana' } }).expect(400);
    await api.post('/api/v2/modules/vaultSecure/items').set(auth).send({ item: item('b') }).expect(201);
    expect((await api.put('/api/v2/modules/vaultSecure/items/a').set(auth).send({ iv: b64(12, 9), ct: b64(64, 9) }).expect(200)).body.item).toEqual(item('a', 9));
    await api.put('/api/v2/modules/vaultSecure/items/zzz').set(auth).send({ iv: b64(12), ct: b64(64) }).expect(404);
    await api.delete('/api/v2/modules/vaultSecure/items/b').set(auth).expect(200);

    // Migración: añade las cifradas y quita de `vault` solo las que cifran, en la misma escritura.
    await api.post('/api/v2/modules/vaultSecure/migrate').set(auth).send({ items: [item('a')], legacyIds: ['v1'] }).expect(409);
    const res = await api.post('/api/v2/modules/vaultSecure/migrate').set(auth).send({ items: [item('m1'), item('m2')], legacyIds: ['v1', 'v2'] }).expect(200);
    expect(res.body).toMatchObject({ migrated: 2, remaining: 1 });
    let doc = await sync();
    expect(doc.vault).toEqual([legacyVault[2]]);
    expect((doc.vaultSecure as { items: unknown[] }).items).toEqual([item('a', 9), item('m1'), item('m2')]);
    expect(JSON.stringify(doc.vaultSecure)).not.toMatch(/secreta|Banco|ana/);
    expect(doc.claveFutura).toEqual(OLD_DOC.claveFutura);

    // Borrar la bóveda (contraseña maestra olvidada) no toca la lista antigua.
    await api.delete('/api/v2/modules/vaultSecure').set(auth).expect(200);
    doc = await sync();
    expect(doc).not.toHaveProperty('vaultSecure');
    expect(doc.vault).toEqual([legacyVault[2]]);
    await api.post('/api/v2/modules/vaultSecure/migrate').set(auth).send({ items: [item('m3')], legacyIds: ['v3'] }).expect(404);
  });
});

import { createClient } from '@dyc/api-client';
import { addDays, LEGACY_KEYS, legacyItemSchemas, todayIn } from '@dyc/core';
import { describe, expect, it } from 'vitest';
import { demoAssistantReply } from './assistant';
import { browserTimeZone, memoryStorage, type DemoStorage } from './db';
import { SAMPLE_TOKEN } from './seed';
import { createDemoServer } from './server';

// La API falsa de la versión de prueba, a través del cliente de verdad. Sin red.

function setup(opts: { storage?: DemoStorage; now?: () => Date; token?: string | null } = {}) {
  const storage = opts.storage ?? memoryStorage();
  const server = createDemoServer({ storage, now: opts.now });
  let token: string | null = opts.token === undefined ? server.bootToken(null) : opts.token;
  const api = createClient({ baseUrl: '', getToken: () => token, fetch: server.fetch });
  return { server, api, storage, setToken: (t: string | null) => (token = t) };
}

const today = () => todayIn(browserTimeZone());

describe('API falsa de la versión de prueba', () => {
  it('empieza con la sesión de ejemplo abierta y la cuenta de Lucía', async () => {
    const { api } = setup();
    const user = await api.auth.me();
    expect(user).toMatchObject({ name: 'Lucía Romero', showCycle: true });
    const profile = await api.profile.get();
    expect(profile).toMatchObject({ focusPillars: ['enfoque', 'descanso'], onboarded: true });
  });

  it('el panel tiene la forma de la API real y datos de tres semanas', async () => {
    const { api } = setup();
    const d = await api.dashboard('week');
    expect(Object.keys(d).sort()).toEqual(
      ['challenges', 'checkIns', 'date', 'habits', 'onboarded', 'overall', 'period', 'pillars', 'previousRange', 'range', 'recommendations', 'series', 'today', 'todayStatus'].sort(),
    );
    expect(d.today).toBe(today());
    expect(d.pillars.map((p) => p.id)).toEqual(['movimiento', 'descanso', 'alimentacion', 'enfoque', 'relaciones', 'proposito']);
    expect(d.series).toHaveLength(7);
    expect(d.previousRange.to).toBe(addDays(d.range.from, -1));
    expect(d.overall.score).toBeGreaterThan(0);
    expect(d.overall.previous).toBeGreaterThan(0);
    expect(d.checkIns.streak).toBe(12);
    expect(d.todayStatus.checkIn).toBeNull();
    expect(d.todayStatus.habits.filter((h) => h.done)).toHaveLength(2);
    expect(d.challenges.map((c) => c.key)).toEqual(['atencion-2', 'dormir-1']);
    expect(d.recommendations.length).toBeGreaterThan(0);
    const month = await api.dashboard('month');
    expect(month.series.length).toBeGreaterThanOrEqual(28);
  });

  it('guardar el check-in de hoy cambia el panel y la racha', async () => {
    const { api } = setup();
    const saved = await api.checkIns.save(today(), { mood: 4, sleepHours: 7.5, note: 'Buen día' });
    expect(saved).toMatchObject({ date: today(), mood: 4, sleepHours: 7.5, energy: null, note: 'Buen día' });
    const d = await api.dashboard('week');
    expect(d.todayStatus.checkIn).toMatchObject({ mood: 4 });
    expect(d.checkIns.streak).toBe(13);
    // null borra un campo; lo demás se conserva.
    const again = await api.checkIns.save(today(), { note: null, water: 6 });
    expect(again).toMatchObject({ mood: 4, water: 6, note: null });
    const list = await api.checkIns.list(today(), today());
    expect(list.checkIns).toHaveLength(1);
    await expect(api.checkIns.save(addDays(today(), 5), { mood: 3 })).rejects.toMatchObject({ status: 400 });
  });

  it('marcar un hábito se ve en el panel; crear, archivar y borrar', async () => {
    const { api } = setup();
    const before = await api.dashboard('week');
    const pending = before.todayStatus.habits.find((h) => !h.done);
    expect(pending).toBeTruthy();
    await api.habits.log(pending!.id, today(), true);
    const after = await api.dashboard('week');
    expect(after.todayStatus.habits.find((h) => h.id === pending!.id)?.done).toBe(true);

    const h = await api.habits.create({ title: 'Estirar 5 minutos', pillar: 'movimiento' });
    expect(h).toMatchObject({ title: 'Estirar 5 minutos', days: '1234567', startsOn: today(), archived: false });
    expect((await api.habits.update(h.id, { archived: true })).archived).toBe(true);
    expect((await api.habits.list()).habits.some((x) => x.id === h.id)).toBe(false);
    expect((await api.habits.list(true)).habits.some((x) => x.id === h.id)).toBe(true);
    await api.habits.remove(h.id);
    await expect(api.habits.remove(h.id)).rejects.toMatchObject({ status: 404, message: 'Hábito no encontrado' });
  });

  it('retos: máximo tres activos, sin repetir, y registro por día', async () => {
    const { api } = setup();
    await expect(api.challenges.start('atencion-2')).rejects.toMatchObject({ status: 409, message: 'Ya tienes este reto activo' });
    const c = await api.challenges.start('conexion-1');
    expect(c).toMatchObject({ key: 'conexion-1', status: 'active', dayNumber: 1, doneDays: 0 });
    await expect(api.challenges.start('sentido-1')).rejects.toMatchObject({ status: 409 });
    const logged = await api.challenges.log(c.id, today(), true);
    expect(logged).toMatchObject({ doneToday: true, doneDays: 1 });
    const list = await api.challenges.list();
    expect(list.active).toHaveLength(3);
    expect(list.past.map((p) => p.status).sort()).toEqual(['abandoned', 'completed']);
  });

  it('el documento de ejemplo tiene algo en cada herramienta y todo es válido', async () => {
    const { api } = setup();
    const { data } = await api.modules.get();
    for (const key of LEGACY_KEYS) {
      const list = data[key];
      expect(Array.isArray(list) && list.length > 0, key).toBe(true);
      for (const item of list as unknown[]) expect(legacyItemSchemas[key].safeParse(item).success, `${key}: ${JSON.stringify(item)}`).toBe(true);
    }
    expect(data.cycle).toEqual({ cycleLength: 28, periodLength: 5 });
    expect(data.budget).toEqual({ monthly: 700 });
  });

  it('módulos: añadir, cambiar, reordenar y borrar como la API', async () => {
    const { api } = setup();
    const added = await api.modules.add('todos', { id: 'nuevo1', title: 'Comprar pan' });
    expect(added.item).toEqual({ id: 'nuevo1', title: 'Comprar pan', done: false });
    await expect(api.modules.add('todos', { id: 'nuevo1', title: 'Otra vez' })).rejects.toMatchObject({ status: 409 });
    await expect(api.modules.add('subtasks', { id: 's9', todoId: 'no-existe', title: 'x' })).rejects.toMatchObject({ status: 400, message: 'La tarea principal no existe' });

    const upd = await api.modules.update('tasks', 't2', { time: '09:30' });
    expect(upd.item).toMatchObject({ id: 't2', time: '09:30', rem: true });
    await expect(api.modules.update('blocks', 'b7', { start: 23.5 })).rejects.toMatchObject({ status: 400 });
    await expect(api.modules.update('todos', 'no-existe', { done: true })).rejects.toMatchObject({ status: 404 });

    await api.modules.reorder('todos', ['nuevo1', 'd2']);
    // Borrar un pendiente borra sus subtareas.
    await api.modules.remove('todos', 'd1');
    const { data } = await api.modules.get();
    expect((data.todos ?? []).map((t) => t.id).slice(0, 2)).toEqual(['nuevo1', 'd2']);
    expect((data.subtasks ?? []).some((s) => s.todoId === 'd1')).toBe(false);

    // Lo más reciente primero en Enfoque; un solo registro por día en el Diario.
    await api.modules.add('focus', { id: 'fz', mode: 'focus', seconds: 60, dateKey: today() });
    expect((await api.modules.get()).data.focus?.[0].id).toBe('fz');
    const journalDay = (await api.modules.get()).data.journal?.[0].date as string;
    await expect(api.modules.add('journal', { id: 'jz', date: journalDay, mood: '', gratitude: '', note: 'x' })).rejects.toMatchObject({ status: 409 });

    // Objetos: `patch` fusiona y `set` exige el objeto entero.
    expect((await api.modules.patch('dayLog', { water: 7 })).value).toMatchObject({ water: 7, waterGoal: 8 });
    expect((await api.modules.set('budget', { monthly: 900 })).value).toEqual({ monthly: 900 });
    await expect(api.modules.set('cycle', { cycleLength: 5 } as never)).rejects.toMatchObject({ status: 400 });
  });

  it('bóveda cifrada: crear una sola vez, añadir y borrar entradas', async () => {
    const { api } = setup();
    const iv = 'AAAAAAAAAAAAAAAA';
    const ct = 'A'.repeat(24);
    const vault = { v: 1 as const, kdf: { name: 'PBKDF2' as const, hash: 'SHA-256' as const, iterations: 600_000, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' }, check: { iv, ct }, items: [] };
    await expect(api.vault.add({ id: 'e0', iv, ct })).rejects.toMatchObject({ status: 404, message: 'Aún no has creado la bóveda' });
    expect((await api.vault.create(vault)).value).toEqual(vault);
    await expect(api.vault.create(vault)).rejects.toMatchObject({ status: 409, message: 'Ya tienes una bóveda' });
    await api.vault.add({ id: 'e1', iv, ct });
    await expect(api.vault.add({ id: 'e2', iv, ct: 'corto' })).rejects.toMatchObject({ status: 400 });
    await api.vault.remove('e1');
    await expect(api.vault.remove('e1')).rejects.toMatchObject({ status: 404 });
  });

  it('acceso: cualquier contraseña vale; registrar crea una cuenta sin onboarding', async () => {
    const { api, setToken } = setup({ token: null });
    await expect(api.profile.get()).rejects.toMatchObject({ status: 401 });
    const s = await api.auth.login({ email: 'quien@sea.com', password: 'loquesea123' });
    expect(s.user.name).toBe('Lucía Romero');
    const r = await api.auth.register({ email: 'nueva@ejemplo.com', password: 'contraseña-larga', name: 'Nora' });
    setToken(r.token);
    expect((await api.profile.get()).onboarded).toBe(false);
    await expect(api.auth.register({ email: 'nueva@ejemplo.com', password: 'contraseña-larga' })).rejects.toMatchObject({ status: 409 });
    // Cerrar las demás sesiones deja solo el token nuevo.
    const { token } = await api.auth.logoutOthers();
    await expect(api.auth.me()).rejects.toMatchObject({ status: 401 });
    setToken(token);
    expect((await api.auth.me()).name).toBe('Nora');
  });

  it('lo guardado sigue ahí al recargar, y se mueve de fecha si se abre otro día', async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    await first.api.modules.add('todos', { id: 'persiste', title: 'Sigo aquí' });
    await first.api.checkIns.save(today(), { mood: 5 });

    const reload = setup({ storage, token: SAMPLE_TOKEN });
    expect(reload.server.bootToken(null)).toBeNull();
    expect(reload.server.bootToken(SAMPLE_TOKEN)).toBe(SAMPLE_TOKEN);
    expect((await reload.api.modules.get()).data.todos?.some((t) => t.id === 'persiste')).toBe(true);

    const later = new Date(Date.now() + 3 * 86_400_000);
    const moved = setup({ storage, token: SAMPLE_TOKEN, now: () => later });
    const d = await moved.api.dashboard('week');
    expect(d.today).toBe(todayIn(browserTimeZone(), later));
    // El check-in de «hoy» se movió con los días: sigue siendo de hoy.
    expect(d.todayStatus.checkIn).toMatchObject({ mood: 5 });
  });

  it('no responde nada fuera de /api (nunca sale a la red)', async () => {
    const { server } = setup();
    await expect(server.fetch('https://generativelanguage.googleapis.com/v1beta/x')).rejects.toThrow(TypeError);
    const res = await server.fetch('/api/no-existe');
    expect(res.status).toBe(404);
  });

  it('el asistente de prueba propone acciones sin conectarse a nada', () => {
    const todo = demoAssistantReply([{ role: 'user', content: 'Añade «comprar pan» a mis pendientes' }]);
    expect(todo.tool_calls?.[0]).toMatchObject({ function: { name: 'add_todo', arguments: JSON.stringify({ title: 'Comprar pan' }) } });
    const water = demoAssistantReply([{ role: 'user', content: 'Anota 2 vasos de agua' }]);
    expect(water.tool_calls?.[0]).toMatchObject({ function: { name: 'log_water' } });
    expect(demoAssistantReply([{ role: 'user', content: 'hola' }]).content).toMatch(/versión de prueba/i);
  });
});

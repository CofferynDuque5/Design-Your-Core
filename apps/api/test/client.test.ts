import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { ApiError, createClient, type ApiClient } from '@dyc/api-client';
import { todayIn } from '@dyc/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeApp, prisma, resetDb } from './helpers.js';

// El cliente tipado (@dyc/api-client) contra el servidor real: comprueba que
// las rutas y las formas de respuesta que usan la web y la app móvil existen.

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const { app } = makeApp();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});
beforeEach(resetDb);

function client(onUnauthorized?: () => void) {
  let token: string | null = null;
  const api = createClient({ baseUrl, getToken: () => token, onUnauthorized });
  return { api, setToken: (t: string | null) => (token = t) };
}

async function signedIn(): Promise<ApiClient> {
  const { api, setToken } = client();
  const s = await api.auth.register({ email: 'cliente@example.com', password: 'contraseña-segura', name: 'Cliente' });
  setToken(s.token);
  await api.profile.update({ timezone: 'UTC' });
  return api;
}

describe('@dyc/api-client', () => {
  it('registra, entra y lee la sesión', async () => {
    const { api, setToken } = client();
    const reg = await api.auth.register({ email: 'a@example.com', password: 'contraseña-segura', name: 'Ana' });
    expect(reg.user).toMatchObject({ email: 'a@example.com', name: 'Ana' });
    const login = await api.auth.login({ email: 'a@example.com', password: 'contraseña-segura' });
    setToken(login.token);
    expect(await api.auth.me()).toMatchObject({ id: reg.user.id });
    expect(await api.health()).toMatchObject({ ok: true });
  });

  it('convierte los errores en ApiError con el mensaje de la API', async () => {
    const { api } = client();
    const err = await api.auth.login({ email: 'nadie@example.com', password: 'contraseña-segura' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, message: 'Correo o contraseña incorrectos', isNetwork: false });
  });

  it('avisa cuando la sesión deja de valer', async () => {
    let expired = 0;
    const { api, setToken } = client(() => expired++);
    setToken('token-caducado');
    await expect(api.auth.me()).rejects.toMatchObject({ status: 401 });
    expect(expired).toBe(1);
  });

  it('marca los fallos de red', async () => {
    const api = createClient({ baseUrl: 'http://127.0.0.1:1', getToken: () => null });
    await expect(api.health()).rejects.toMatchObject({ status: 0, isNetwork: true });
  });

  it('con sesión renovable, un token de acceso caducado se renueva solo y la petición se repite', async () => {
    let access: string | null = null;
    let refresh: string | null = null;
    let expired = 0;
    const api: ApiClient = createClient({
      baseUrl,
      getToken: () => access,
      onUnauthorized: () => expired++,
      refresh: async () => {
        if (!refresh) return null;
        const pair = await api.session.refresh(refresh).catch(() => null);
        access = pair?.accessToken ?? null;
        refresh = pair?.refreshToken ?? null;
        return access;
      },
    });
    const s = await api.session.register({ email: 'movil@example.com', password: 'contraseña-segura', name: 'Ana', device: 'Pixel' });
    ({ accessToken: access, refreshToken: refresh } = s);
    const firstRefresh = refresh;

    access = 'token-de-acceso-caducado';
    const [me, profile] = await Promise.all([api.auth.me(), api.profile.get()]);
    expect(me.email).toBe('movil@example.com');
    expect(profile.timezone).toBe('UTC');
    expect(refresh).not.toBe(firstRefresh);
    expect(expired).toBe(0);

    // Sin sesión renovable válida: avisa una vez y no entra en bucle.
    await api.session.logout(refresh as string);
    access = 'token-de-acceso-caducado';
    await expect(api.auth.me()).rejects.toMatchObject({ status: 401 });
    expect(expired).toBe(1);

    // Los dispositivos se registran con la sesión.
    const again = await api.session.login({ email: 'movil@example.com', password: 'contraseña-segura' });
    access = again.accessToken;
    await expect(api.devices.register('ExponentPushToken[prueba-123456]', 'android')).resolves.toEqual({ ok: true });
  });

  it('recorre onboarding, check-in, hábitos, retos y panel', async () => {
    const api = await signedIn();
    const today = todayIn('UTC');

    const profile = await api.profile.update({ focusPillars: ['descanso'], intention: 'Dormir mejor', completeOnboarding: true });
    expect(profile).toMatchObject({ onboarded: true, focusPillars: ['descanso'] });

    const checkIn = await api.checkIns.save(today, { mood: 4, sleepHours: 7.5, note: 'Buen día' });
    expect(checkIn).toMatchObject({ date: today, mood: 4, sleepHours: 7.5 });
    expect((await api.checkIns.save(today, { note: null })).note).toBeNull();
    expect((await api.checkIns.list()).checkIns).toHaveLength(1);

    const habit = await api.habits.create({ title: 'Leer 10 minutos', pillar: 'proposito' });
    await api.habits.log(habit.id, today, true);
    const { habits } = await api.habits.list();
    expect(habits[0].recent).toEqual([{ date: today, done: true }]);

    const [first] = await api.challenges.catalog();
    const started = await api.challenges.start(first.key);
    const logged = await api.challenges.log(started.id, today, true);
    expect(logged).toMatchObject({ doneToday: true, doneDays: 1 });

    const dash = await api.dashboard('week');
    expect(dash.today).toBe(today);
    expect(dash.pillars).toHaveLength(6);
    expect(dash.todayStatus.habits).toEqual([{ id: habit.id, title: 'Leer 10 minutos', pillar: 'proposito', done: true }]);
    expect(dash.challenges[0].id).toBe(started.id);

    const recs = await api.recommendations.list();
    if (recs.length) {
      await api.recommendations.dismiss(recs[0].key);
      expect((await api.recommendations.list()).map((r) => r.key)).not.toContain(recs[0].key);
    }

    const data = await api.account.export();
    expect(data.checkIns).toHaveLength(1);
    expect(data.habits[0].logs).toEqual([{ date: today, done: true }]);
  });
  it('edita los módulos de la app anterior elemento a elemento', async () => {
    const api = await signedIn();
    await api.modules.add('todos', { id: 'a', title: 'Uno', done: false });
    await api.modules.add('todos', { id: 'b', title: 'Dos', done: false });
    await api.modules.add('subtasks', { id: 's', todoId: 'a', title: 'Paso', done: false });
    const upd = await api.modules.update('todos', 'a', { done: true });
    expect(upd.item).toEqual({ id: 'a', title: 'Uno', done: true });
    await api.modules.reorder('todos', ['b', 'a']);
    await api.modules.remove('todos', 'a');
    const { data } = await api.modules.get();
    expect(data.todos).toEqual([{ id: 'b', title: 'Dos', done: false }]);
    expect(data.subtasks).toEqual([]);
    expect((await api.legacy.get()).data).toEqual(data);
  });
  it('tanda 2: temas por lista completa, cascada de cajitas e imágenes de los apuntes', async () => {
    const api = await signedIn();
    await api.modules.add('subjects', { id: 's1', name: 'Física', teacher: '', room: '', color: '#4F7CFF', nextClass: '', topics: [] });
    const upd = await api.modules.update('subjects', 's1', { topics: [{ id: 't1', name: 'Ondas', done: true }] });
    expect(upd.item.topics).toEqual([{ id: 't1', name: 'Ondas', done: true }]);
    await api.modules.add('notebooks', { id: 'n1', title: 'Cálculo', category: 'General', subject: '', topic: '', color: '#4F7CFF', emoji: '📓' });
    await api.modules.add('noteBoxes', { id: 'b1', notebookId: 'n1', title: '', text: 'Hola', color: '#FFF7D6', kind: 'text', lang: '' });
    await api.modules.remove('notebooks', 'n1');
    expect((await api.modules.get()).data.noteBoxes).toEqual([]);
    expect(await api.legacy.images(['no-existe'])).toEqual({ images: {} });
  });
  it('tanda 3: listas con cascada, objetos y el ajuste de Ciclo', async () => {
    const api = await signedIn();
    await api.modules.add('pets', { id: 'p1', name: 'Luna', species: 'cat', note: '' });
    await api.modules.add('petCares', { id: 'c1', petId: 'p1', kind: 'comida', title: 'Comida', time: '08:00', days: '1234567', sound: true, enabled: true, lastDone: '' });
    await api.modules.remove('pets', 'p1');
    expect((await api.modules.get()).data.petCares).toEqual([]);
    expect((await api.modules.patch('cycle', { cycleLength: 30 })).value).toEqual({ cycleLength: 30, periodLength: 5 });
    expect((await api.modules.set('budget', { monthly: 900 })).value).toEqual({ monthly: 900 });
    const { data } = await api.modules.get();
    expect(data.cycle).toEqual({ cycleLength: 30, periodLength: 5 });
    expect(data.budget).toEqual({ monthly: 900 });
    expect((await api.auth.updateMe({ showCycle: true })).showCycle).toBe(true);
    expect((await api.auth.me()).showCycle).toBe(true);
  });
});

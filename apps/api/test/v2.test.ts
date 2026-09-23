import { addDays, todayIn } from '@dyc/core';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, makeApp, prisma, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const today = () => todayIn('UTC');

async function setup() {
  const ctx = makeApp();
  const u = await registerUser(ctx.api);
  const auth = bearer(u.token);
  await ctx.api.put('/api/v2/profile').set(auth).send({ timezone: 'UTC' }).expect(200);
  return { ...ctx, ...u, auth };
}

describe('v2 · perfil y onboarding', () => {
  it('guarda por pasos y marca el onboarding como terminado', async () => {
    const { api, auth } = await setup();
    const empty = await api.get('/api/v2/profile').set(auth).expect(200);
    expect(empty.body.profile).toMatchObject({ focusPillars: [], onboarded: false, timezone: 'UTC' });

    await api.put('/api/v2/profile').set(auth).send({ focusPillars: ['descanso', 'relaciones'], baseline: { descanso: 2 } }).expect(200);
    const done = await api.put('/api/v2/profile').set(auth).send({ energyLevel: 3, baseline: { movimiento: 4 }, completeOnboarding: true }).expect(200);
    expect(done.body.profile).toMatchObject({
      focusPillars: ['descanso', 'relaciones'],
      energyLevel: 3,
      baseline: { descanso: 2, movimiento: 4 },
      onboarded: true,
    });
  });

  it('valida las respuestas', async () => {
    const { api, auth } = await setup();
    const res = await api.put('/api/v2/profile').set(auth).send({ focusPillars: ['astrologia'] }).expect(400);
    expect(res.body.error).toMatch(/Datos inválidos/);
    await api.put('/api/v2/profile').set(auth).send({ wakeTime: '25:00' }).expect(400);
    await api.get('/api/v2/profile').expect(401);
  });
});

describe('v2 · check-ins', () => {
  it('crea, completa, borra campos y lista por rango', async () => {
    const { api, auth } = await setup();
    const d = today();
    await api.put(`/api/v2/checkins/${d}`).set(auth).send({ mood: 4, sleepHours: 7.5 }).expect(200);
    const merged = await api.put(`/api/v2/checkins/${d}`).set(auth).send({ energy: 3, sleepHours: null }).expect(200);
    expect(merged.body.checkIn).toMatchObject({ date: d, mood: 4, energy: 3, sleepHours: null });

    await api.put(`/api/v2/checkins/${addDays(d, -1)}`).set(auth).send({ stress: 2 }).expect(200);
    const list = await api.get(`/api/v2/checkins?from=${addDays(d, -7)}&to=${d}`).set(auth).expect(200);
    expect(list.body.checkIns.map((c: { date: string }) => c.date)).toEqual([addDays(d, -1), d]);

    await api.delete(`/api/v2/checkins/${d}`).set(auth).expect(200);
    expect((await api.get('/api/v2/checkins').set(auth)).body.checkIns).toHaveLength(1);
  });

  it('rechaza fechas futuras, campos desconocidos y valores fuera de escala', async () => {
    const { api, auth } = await setup();
    await api.put(`/api/v2/checkins/${addDays(today(), 3)}`).set(auth).send({ mood: 3 }).expect(400);
    await api.put('/api/v2/checkins/2026-13-01').set(auth).send({ mood: 3 }).expect(400);
    await api.put(`/api/v2/checkins/${today()}`).set(auth).send({ mood: 9 }).expect(400);
    await api.put(`/api/v2/checkins/${today()}`).set(auth).send({ hackeo: null }).expect(400);
  });

  it('cada persona ve solo sus check-ins', async () => {
    const { api, auth } = await setup();
    await api.put(`/api/v2/checkins/${today()}`).set(auth).send({ mood: 5 }).expect(200);
    const other = await registerUser(api);
    expect((await api.get('/api/v2/checkins').set(bearer(other.token))).body.checkIns).toEqual([]);
  });
});

describe('v2 · hábitos', () => {
  it('registra el historial por día y respeta la propiedad', async () => {
    const { api, auth } = await setup();
    const created = await api.post('/api/v2/habits').set(auth).send({ title: 'Caminar al mediodía', pillar: 'movimiento' }).expect(201);
    const id = created.body.habit.id;
    await api.put(`/api/v2/habits/${id}/logs/${today()}`).set(auth).send({ done: true }).expect(200);
    await api.put(`/api/v2/habits/${id}/logs/${addDays(today(), -1)}`).set(auth).send({ done: false }).expect(200);

    const list = await api.get('/api/v2/habits').set(auth).expect(200);
    expect(list.body.habits[0].recent).toHaveLength(2);

    const other = await registerUser(api);
    await api.put(`/api/v2/habits/${id}/logs/${today()}`).set(bearer(other.token)).send({ done: true }).expect(404);
    await api.patch(`/api/v2/habits/${id}`).set(bearer(other.token)).send({ title: 'x' }).expect(404);

    await api.patch(`/api/v2/habits/${id}`).set(auth).send({ archived: true }).expect(200);
    expect((await api.get('/api/v2/habits').set(auth)).body.habits).toHaveLength(0);
    expect((await api.get('/api/v2/habits?archived=1').set(auth)).body.habits).toHaveLength(1);
    await api.delete(`/api/v2/habits/${id}`).set(auth).expect(200);
  });
});

describe('v2 · retos', () => {
  it('acepta retos del catálogo, registra días y limita a tres activos', async () => {
    const { api, auth } = await setup();
    const catalog = await api.get('/api/v2/challenges/catalog').set(auth).expect(200);
    expect(catalog.body.challenges.length).toBe(24);

    const c1 = await api.post('/api/v2/challenges').set(auth).send({ key: 'caminar-1' }).expect(201);
    expect(c1.body.challenge).toMatchObject({ key: 'caminar-1', pillar: 'movimiento', dayNumber: 1, doneDays: 0, durationDays: 7 });
    await api.post('/api/v2/challenges').set(auth).send({ key: 'caminar-1' }).expect(409);
    await api.post('/api/v2/challenges').set(auth).send({ key: 'no-existe' }).expect(404);

    const logged = await api.put(`/api/v2/challenges/${c1.body.challenge.id}/logs/${today()}`).set(auth).send({ done: true }).expect(200);
    expect(logged.body.challenge).toMatchObject({ doneDays: 1, doneToday: true });
    await api.put(`/api/v2/challenges/${c1.body.challenge.id}/logs/${addDays(today(), -3)}`).set(auth).send({ done: true }).expect(400);

    await api.post('/api/v2/challenges').set(auth).send({ key: 'dormir-1' }).expect(201);
    await api.post('/api/v2/challenges').set(auth).send({ key: 'conexion-1' }).expect(201);
    const full = await api.post('/api/v2/challenges').set(auth).send({ key: 'comer-1' }).expect(409);
    expect(full.body.error).toMatch(/hasta 3 retos/);

    // Subir de nivel reemplaza el reto, aunque ya haya tres activos.
    const up = await api.post('/api/v2/challenges').set(auth).send({ key: 'caminar-2', replaces: c1.body.challenge.id }).expect(201);
    const list = await api.get('/api/v2/challenges').set(auth).expect(200);
    expect(list.body.active.map((c: { key: string }) => c.key).sort()).toEqual(['caminar-2', 'conexion-1', 'dormir-1']);
    expect(list.body.past[0]).toMatchObject({ key: 'caminar-1', status: 'abandoned' });

    await api.patch(`/api/v2/challenges/${up.body.challenge.id}`).set(auth).send({ status: 'completed' }).expect(200);
  });

  it('da por completados los retos cuyo plazo terminó', async () => {
    const { api, auth, user } = await setup();
    await prisma.userChallenge.create({
      data: { userId: user.id, challengeKey: 'pausa-activa', pillar: 'movimiento', startedOn: new Date(`${addDays(today(), -10)}T00:00:00Z`), durationDays: 5 },
    });
    const list = await api.get('/api/v2/challenges').set(auth).expect(200);
    expect(list.body.active).toEqual([]);
    expect(list.body.past[0]).toMatchObject({ key: 'pausa-activa', status: 'completed' });
  });
});

describe('v2 · panel', () => {
  it('puntúa los pilares de la semana y los compara con la anterior', async () => {
    const { api, auth } = await setup();
    const d = today();
    const lastWeek = addDays(d, -7);
    await api.put(`/api/v2/checkins/${d}`).set(auth).send({ mood: 5, stress: 1, sleepHours: 8, sleepQuality: 5, connection: 4 }).expect(200);
    await api.put(`/api/v2/checkins/${lastWeek}`).set(auth).send({ mood: 3, stress: 3, sleepHours: 5, sleepQuality: 3 }).expect(200);
    const habit = await api.post('/api/v2/habits').set(auth).send({ title: 'Estirar', pillar: 'movimiento' }).expect(201);
    await prisma.habit.update({ where: { id: habit.body.habit.id }, data: { startsOn: new Date(`${lastWeek}T00:00:00Z`) } });
    await api.put(`/api/v2/habits/${habit.body.habit.id}/logs/${d}`).set(auth).send({ done: true }).expect(200);

    const res = await api.get(`/api/v2/dashboard?period=week&date=${d}`).set(auth).expect(200);
    const b = res.body;
    expect(b.range.from <= d && d <= b.range.to).toBe(true);
    const by = Object.fromEntries(b.pillars.map((p: { id: string }) => [p.id, p]));
    expect(by.enfoque.score).toBe(100);
    expect(by.enfoque.previous).toBe(50);
    expect(by.enfoque.delta).toBe(50);
    expect(by.descanso.score).toBe(100);
    expect(by.descanso.previous).toBe(50);
    expect(by.relaciones.score).toBe(75);
    expect(by.alimentacion.score).toBeNull();
    expect(b.pillars.map((p: { id: string }) => p.id)).toEqual(['movimiento', 'descanso', 'alimentacion', 'enfoque', 'relaciones', 'proposito']);
    expect(b.series).toHaveLength(7);
    expect(b.checkIns.streak).toBe(1);
    expect(b.todayStatus.checkIn.mood).toBe(5);
    expect(b.todayStatus.habits).toEqual([expect.objectContaining({ title: 'Estirar', done: true })]);
    expect(b.habits.done).toBeGreaterThanOrEqual(1);
  });

  it('usa el día local de la persona, no el del servidor', async () => {
    const { api, auth } = await setup();
    // UTC+14 y UTC-11: al menos una de las dos está en un día distinto al de UTC.
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      await api.put('/api/v2/profile').set(auth).send({ timezone: tz }).expect(200);
      const h = await api.post('/api/v2/habits').set(auth).send({ title: `Hábito ${tz}`, pillar: 'descanso' }).expect(201);
      const local = todayIn(tz);
      expect(h.body.habit.startsOn).toBe(local);
      const dash = await api.get('/api/v2/dashboard?period=day').set(auth).expect(200);
      expect(dash.body.today).toBe(local);
      expect(dash.body.todayStatus.habits.map((x: { title: string }) => x.title)).toContain(`Hábito ${tz}`);
    }
  });

  it('funciona para día y mes, y valida el periodo', async () => {
    const { api, auth } = await setup();
    const day = await api.get('/api/v2/dashboard?period=day').set(auth).expect(200);
    expect(day.body.series).toHaveLength(1);
    expect(day.body.overall.score).toBeNull();
    const month = await api.get('/api/v2/dashboard?period=month').set(auth).expect(200);
    expect(month.body.series.length).toBeGreaterThanOrEqual(28);
    await api.get('/api/v2/dashboard?period=year').set(auth).expect(400);
  });
});

describe('v2 · recomendaciones', () => {
  it('explica el motivo y se pueden descartar', async () => {
    const { api, auth } = await setup();
    await api.put('/api/v2/profile').set(auth).send({ focusPillars: ['relaciones'] }).expect(200);
    const first = await api.get('/api/v2/recommendations').set(auth).expect(200);
    const keys = first.body.recommendations.map((r: { key: string }) => r.key);
    expect(keys).toContain('checkin-missing');
    expect(keys).toContain('focus:relaciones');
    const focus = first.body.recommendations.find((r: { key: string }) => r.key === 'focus:relaciones');
    expect(focus.reason).toMatch(/relaciones/);
    expect(focus.action).toEqual({ type: 'start-challenge', challengeKey: 'conexion-1' });

    await api.post('/api/v2/recommendations/checkin-missing/dismiss').set(auth).expect(200);
    const after = await api.get('/api/v2/recommendations').set(auth).expect(200);
    expect(after.body.recommendations.map((r: { key: string }) => r.key)).not.toContain('checkin-missing');

    // Aceptar el reto hace que deje de recomendarse.
    await api.post('/api/v2/challenges').set(auth).send({ key: 'conexion-1' }).expect(201);
    const accepted = await api.get('/api/v2/recommendations').set(auth).expect(200);
    expect(accepted.body.recommendations.map((r: { key: string }) => r.key)).not.toContain('focus:relaciones');
  });
});

describe('v2 · cuenta', () => {
  it('exporta los datos de la persona', async () => {
    const { api, auth } = await setup();
    await api.put(`/api/v2/checkins/${today()}`).set(auth).send({ mood: 4, note: 'Buen día' }).expect(200);
    await api.put('/api/sync').set(auth).send({ data: { habits: [] } }).expect(200);
    const res = await api.get('/api/v2/account/export').set(auth).expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.checkIns[0]).toMatchObject({ mood: 4, note: 'Buen día' });
    expect(res.body.legacy).toEqual({ habits: [] });
    expect(res.body.user.email).toBeTruthy();
  });

  it('borra la cuenta con contraseña y desvincula a la pareja', async () => {
    const { api, auth, password, user } = await setup();
    const partner = await registerUser(api);
    const inv = await api.post('/api/partner/invite').set(auth).expect(200);
    await api.post('/api/partner/accept').set(bearer(partner.token)).send({ code: inv.body.code }).expect(200);

    await api.delete('/api/v2/account').set(auth).send({ password: 'equivocada' }).expect(401);
    await api.delete('/api/v2/account').set(auth).send({ password }).expect(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: partner.user.id } })).partnerId).toBeNull();
    await api.get('/api/me').set(auth).expect(401);
  });
});

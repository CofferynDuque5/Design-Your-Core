import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, db, makeApp, registerUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => db.close());

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('espacio en pareja', () => {
  it('solo con pareja vinculada; las dos personas ven, cambian y borran lo compartido', async () => {
    const { api } = makeApp();
    const a = await registerUser(api, { name: 'Vale' });
    const b = await registerUser(api, { name: 'Nathan' });
    const c = await registerUser(api, { name: 'Otra' });

    expect((await api.get('/api/v2/couple').set(bearer(a.token)).expect(200)).body).toEqual({ partner: null, items: [] });
    await api.post('/api/v2/couple/items').set(bearer(a.token)).send({ kind: 'meta', data: { title: 'Viajar' } }).expect(409);

    const inv = await api.post('/api/partner/invite').set(bearer(a.token)).expect(200);
    await api.post('/api/partner/accept').set(bearer(b.token)).send({ code: inv.body.code }).expect(200);

    const meta = await api.post('/api/v2/couple/items').set(bearer(a.token)).send({ kind: 'meta', data: { title: 'Viajar a Mérida', steps: [{ id: 's1', name: 'Ahorrar' }] } }).expect(201);
    expect(meta.body.item).toMatchObject({ kind: 'meta', byMe: true, data: { title: 'Viajar a Mérida', done: false, steps: [{ id: 's1', name: 'Ahorrar', done: false }] } });
    const foto = await api.post('/api/v2/couple/items').set(bearer(b.token)).send({ kind: 'foto', data: { caption: 'Playa' }, image: PNG, thumb: PNG }).expect(201);
    await api.post('/api/v2/couple/items').set(bearer(b.token)).send({ kind: 'emprendimiento', data: { name: 'Tienda de velas', stage: 'en-marcha' } }).expect(201);
    await api.post('/api/v2/couple/items').set(bearer(b.token)).send({ kind: 'foto', data: {}, image: 'no', thumb: 'no' }).expect(400);

    const seen = await api.get('/api/v2/couple').set(bearer(b.token)).expect(200);
    expect(seen.body.partner).toEqual({ name: 'Vale' });
    expect(seen.body.items).toHaveLength(3);
    expect(seen.body.items.find((x: { kind: string }) => x.kind === 'meta').byMe).toBe(false);
    expect(seen.body.items.find((x: { kind: string }) => x.kind === 'foto')).toMatchObject({ thumb: PNG });
    expect(seen.body.items.find((x: { kind: string }) => x.kind === 'foto').image).toBeUndefined();

    // La otra persona marca la meta como hecha y ve la foto completa.
    const done = await api.patch(`/api/v2/couple/items/${meta.body.item.id}`).set(bearer(b.token)).send({ data: { done: true } }).expect(200);
    expect(done.body.item.data).toMatchObject({ title: 'Viajar a Mérida', done: true });
    expect((await api.get(`/api/v2/couple/items/${foto.body.item.id}/image`).set(bearer(a.token)).expect(200)).body.image).toBe(PNG);

    // Nadie de fuera de la pareja lo ve ni lo toca.
    expect((await api.get('/api/v2/couple').set(bearer(c.token)).expect(200)).body.items).toEqual([]);
    await api.delete(`/api/v2/couple/items/${meta.body.item.id}`).set(bearer(c.token)).expect(409);

    // Al desvincularse se oculta; al volver a vincularse sigue ahí.
    await api.delete('/api/partner').set(bearer(a.token)).expect(200);
    expect((await api.get('/api/v2/couple').set(bearer(a.token))).body.items).toEqual([]);
    const again = await api.post('/api/partner/invite').set(bearer(b.token)).expect(200);
    await api.post('/api/partner/accept').set(bearer(a.token)).send({ code: again.body.code }).expect(200);
    expect((await api.get('/api/v2/couple').set(bearer(a.token))).body.items).toHaveLength(3);

    await api.delete(`/api/v2/couple/items/${meta.body.item.id}`).set(bearer(a.token)).expect(200);
    expect((await api.get('/api/v2/couple').set(bearer(b.token))).body.items).toHaveLength(2);
  });

  it('guarda el personaje del perfil', async () => {
    const { api } = makeApp();
    const a = await registerUser(api);
    expect((await api.get('/api/v2/profile').set(bearer(a.token))).body.profile.avatar).toBe('');
    const saved = await api.put('/api/v2/profile').set(bearer(a.token)).send({ avatar: 'zorro' }).expect(200);
    expect(saved.body.profile.avatar).toBe('zorro');
    await api.put('/api/v2/profile').set(bearer(a.token)).send({ avatar: 'dragon' }).expect(400);
  });
});

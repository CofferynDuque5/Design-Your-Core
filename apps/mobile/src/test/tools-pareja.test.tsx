import type { CoupleItem } from '@dyc/core';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { auth } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { fakeModules, profile, tokens } from './fakeApi';

// En pareja (galería, metas y emprendimientos compartidos) y el personaje del
// perfil, en el móvil, con el enrutador real y una API falsa.

const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();
const now = '2026-11-10T10:00:00.000Z';

function coupleApi(partner: { name: string } | null) {
  let items: CoupleItem[] = [
    { id: 'm1', kind: 'meta', data: { title: 'Viajar a Mérida', note: '', deadline: '', done: false, steps: [{ id: 's1', name: 'Ahorrar', done: true }, { id: 's2', name: 'Reservar', done: false }] }, byMe: false, createdAt: now, updatedAt: now },
    { id: 'e1', kind: 'emprendimiento', data: { name: 'Postres a domicilio', description: '', stage: 'idea', tasks: [] }, byMe: true, createdAt: now, updatedAt: now },
  ];
  return fakeModules({} as never, {
    'GET /api/v2/couple': () => ({ partner, items: partner ? items : [] }),
    'POST /api/v2/couple/items': (b) => {
      const item = { id: `n${items.length}`, byMe: true, createdAt: now, updatedAt: now, ...(b as object) } as CoupleItem;
      items = [item, ...items];
      return [201, { item }];
    },
    'PATCH /api/v2/couple/items/:id': (b, url) => {
      const id = url.pathname.split('/').pop();
      items = items.map((it) => (it.id === id ? ({ ...it, data: { ...it.data, ...(b as { data: object }).data } } as CoupleItem) : it));
      return { item: items.find((it) => it.id === id) };
    },
    'POST /api/partner/invite': () => ({ code: 'ABC123' }),
    'PUT /api/v2/profile': (b) => ({ profile: profile(b as object) }),
  });
}

describe('En pareja y personaje en el móvil', () => {
  beforeEach(async () => {
    queryClient.clear();
    reset();
    await auth.signIn(tokens());
  });

  it('sin pareja vinculada, invita con un código', async () => {
    coupleApi(null);
    renderRouter('./src/app', { initialUrl: '/pareja' });
    expect(await screen.findByText('Vincula a tu pareja')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Crear mi código' }));
    expect(await screen.findByText('ABC123')).toBeOnTheScreen();
  }, 120_000);

  it('con pareja: metas con pasos compartidos y emprendimientos', async () => {
    const api = coupleApi({ name: 'Nathan' });
    renderRouter('./src/app', { initialUrl: '/pareja' });
    expect(await screen.findByText('Nathan')).toBeOnTheScreen();
    expect(screen.getByText('Su galería está vacía')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: 'Metas, 1' }));
    expect(await screen.findByText('Viajar a Mérida')).toBeOnTheScreen();
    expect(screen.getByLabelText('50% logrado')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('checkbox', { name: 'Reservar' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH' && c.path === '/api/v2/couple/items/m1')).toBe(true));
    expect(await screen.findByLabelText('100% logrado')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('radio', { name: 'Emprendimientos, 1' }));
    expect(await screen.findByText('Postres a domicilio')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Nuevo emprendimiento' }));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Fotos de bodas');
    fireEvent.press(screen.getByRole('button', { name: 'Creciendo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Crear emprendimiento' }));
    await waitFor(() => expect(api.calls.find((c) => c.method === 'POST' && c.path === '/api/v2/couple/items')?.body).toEqual({ kind: 'emprendimiento', data: { name: 'Fotos de bodas', description: '', stage: 'creciendo', tasks: [] } }));
    expect(await screen.findByText('Fotos de bodas')).toBeOnTheScreen();
  }, 120_000);

  it('Perfil: elegir un personaje lo guarda', async () => {
    const api = coupleApi(null);
    renderRouter('./src/app', { initialUrl: '/perfil' });
    fireEvent.press(await screen.findByRole('button', { name: 'Elegir personaje' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Zorro' }));
    await waitFor(() => expect(api.calls.find((c) => c.method === 'PUT' && c.path === '/api/v2/profile')?.body).toEqual({ avatar: 'zorro' }));
    expect(await screen.findByRole('button', { name: 'Cambiar personaje' })).toBeOnTheScreen();
  }, 120_000);
});

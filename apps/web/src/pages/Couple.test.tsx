import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tokenStore } from '../app/api';
import { AppRoutes, makeQueryClient, Providers } from '../app/App';
import { fakeFetch, profile, USER } from '../test/fakeApi';

function renderApp(path: string) {
  const client = makeQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  return render(
    <Providers client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </Providers>,
  );
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});
beforeEach(() => tokenStore.set('t1'));

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const at = '2026-11-12T10:00:00.000Z';

describe('En pareja', () => {
  it('sin pareja vinculada invita a vincularse', async () => {
    fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/couple': () => ({ partner: null, items: [] }),
    });
    renderApp('/pareja');
    expect(await screen.findByText('Vincúlate con tu pareja')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Perfil para vincularse' })).toHaveAttribute('href', '/perfil');
  });

  it('muestra fotos, metas y emprendimientos compartidos y deja avanzar los pasos', async () => {
    const items = [
      { id: 'f1', kind: 'foto', data: { caption: 'Playa', takenOn: '' }, thumb: PNG, byMe: true, createdAt: at, updatedAt: at },
      { id: 'm1', kind: 'meta', data: { title: 'Viajar a Mérida', note: '', deadline: '', done: false, steps: [{ id: 's1', name: 'Ahorrar', done: false }] }, byMe: false, createdAt: at, updatedAt: at },
      { id: 'e1', kind: 'emprendimiento', data: { name: 'Velas', description: '', stage: 'idea', tasks: [] }, byMe: true, createdAt: at, updatedAt: at },
    ];
    const api = fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/couple': () => ({ partner: { name: 'Nathan' }, items }),
      'PATCH /api/v2/couple/items/:id': (b) => ({ item: { ...items[1], data: { ...items[1].data, ...(b as { data: object }).data } } }),
      'POST /api/v2/couple/items': (b) => [201, { item: { id: 'n1', byMe: true, createdAt: at, updatedAt: at, ...(b as object) } }],
    });
    renderApp('/pareja');
    expect(await screen.findByText('Tú y Nathan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver la foto «Playa»' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Metas\s1/ }));
    expect(screen.getByRole('heading', { name: 'Viajar a Mérida' })).toBeInTheDocument();
    expect(screen.getByText(/Lo agregó Nathan/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('list', { name: 'Pasos de «Viajar a Mérida»' })).getByRole('checkbox', { name: 'Ahorrar' }));
    await waitFor(() => expect(api.calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/api/v2/couple/items/m1', body: { data: { steps: [{ id: 's1', name: 'Ahorrar', done: true }] } } }));

    await userEvent.click(screen.getByRole('button', { name: /Emprendimientos\s1/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo emprendimiento' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo emprendimiento en pareja' });
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Tienda de plantas');
    await userEvent.click(within(dialog).getByRole('button', { name: 'En marcha' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir emprendimiento' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST' && c.path === '/api/v2/couple/items')).toMatchObject({ body: { kind: 'emprendimiento', data: { name: 'Tienda de plantas', stage: 'en-marcha', tasks: [] } } }),
    );
  });
});

describe('Perfil: tu personaje', () => {
  it('elige un personaje de la app como foto de perfil', async () => {
    const api = fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'PUT /api/v2/profile': (b) => ({ profile: profile(b as object) }),
      'GET /api/partner': () => ({ partner: null }),
      'GET /api/v2/billing': () => [404, { error: 'no' }],
    });
    renderApp('/perfil');
    await userEvent.click(await screen.findByRole('button', { name: 'Elegir personaje' }));
    const picker = screen.getByRole('radiogroup', { name: 'Elige tu personaje' });
    await userEvent.click(within(picker).getByRole('radio', { name: 'Zorro' }));
    await waitFor(() => expect(api.calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/api/v2/profile', body: { avatar: 'zorro' } }));
    expect(await screen.findByRole('img', { name: 'Tu personaje: Zorro' })).toBeInTheDocument();
  });
});

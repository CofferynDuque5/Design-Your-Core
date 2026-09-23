import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { dashboard, fakeFetch, profile, USER } from '../test/fakeApi';
import { tokenStore } from './api';
import { AppRoutes, makeQueryClient, Providers } from './App';

function renderApp(path = '/') {
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

beforeEach(() => tokenStore.set(null));

describe('app web', () => {
  it('sin sesión lleva al acceso y, al entrar, muestra el día', async () => {
    let done = false;
    const api = fakeFetch({
      'POST /api/auth/login': () => ({ token: 't1', user: USER }),
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/dashboard': () => {
        const d = dashboard();
        return { ...d, todayStatus: { ...d.todayStatus, habits: d.todayStatus.habits.map((h) => ({ ...h, done })) } };
      },
      'PUT /api/v2/habits/:id/logs/:date': (b) => {
        done = (b as { done: boolean }).done;
        return { log: { habitId: 'h1', date: '2026-09-23', done } };
      },
    });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Hola de nuevo' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Correo'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-segura');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: /, Ana$/ })).toBeInTheDocument();
    expect(await screen.findByText('Miércoles 23 de septiembre')).toBeInTheDocument();
    expect(screen.getByText('Adelanta tu hora de dormir')).toBeInTheDocument();
    expect(screen.getByText(/Dormiste 6 h/)).toBeInTheDocument();

    const habit = screen.getByRole('checkbox', { name: /Caminar 10 minutos/ });
    await userEvent.click(habit);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Caminar 10 minutos/ })).toBeChecked());
    const put = api.calls.find((c) => c.method === 'PUT');
    expect(put).toMatchObject({ path: '/api/v2/habits/h1/logs/2026-09-23', body: { done: true }, auth: 'Bearer t1' });
  });

  it('muestra el error de acceso de la API', async () => {
    fakeFetch({ 'POST /api/auth/login': () => [401, { error: 'Correo o contraseña incorrectos' }] });
    renderApp('/entrar');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  });

  it('quien no terminó el onboarding va a la bienvenida', async () => {
    tokenStore.set('t1');
    fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile({ onboarded: false, onboardedAt: null, focusPillars: [] }) }),
    });
    renderApp('/progreso');
    expect(await screen.findByRole('heading', { name: /Hola, Ana\. Diseñemos/ })).toBeInTheDocument();
  });

  it('si el token caducó, vuelve al acceso', async () => {
    tokenStore.set('viejo');
    fakeFetch({
      'GET /api/me': () => [401, { error: 'Sesión inválida' }],
      'GET /api/v2/profile': () => [401, { error: 'Sesión inválida' }],
    });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Hola de nuevo' })).toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
  });

  it('el progreso muestra un estado vacío sin datos', async () => {
    tokenStore.set('t1');
    fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/dashboard': () => dashboard({ overall: { score: null, previous: null } }),
    });
    renderApp('/progreso');
    expect(await screen.findByText('Todavía no hay datos en este periodo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hacer el check-in de hoy' })).toBeInTheDocument();
  });

  it('el progreso lista los seis pilares con su puntuación', async () => {
    tokenStore.set('t1');
    fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/dashboard': () => dashboard(),
    });
    renderApp('/progreso');
    const list = await screen.findByRole('heading', { name: 'Tus pilares' });
    const card = list.closest('section') as HTMLElement;
    expect(within(card).getAllByRole('progressbar')).toHaveLength(6);
    expect(within(card).getByText('sin datos')).toBeInTheDocument();
  });

  it('un error de red se ve como tal, con opción de reintentar', async () => {
    tokenStore.set('t1');
    fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
    });
    const { fn } = { fn: globalThis.fetch as unknown as { mockImplementation: (f: () => never) => void } };
    renderApp('/retos');
    await screen.findByRole('heading', { name: 'Pasos pequeños que se notan' });
    fn.mockImplementation(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });
});

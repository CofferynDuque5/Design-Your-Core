import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { tokenStore } from '../../app/api';
import { AppRoutes, makeQueryClient, Providers } from '../../app/App';
import { fakeFetch, USER } from '../../test/fakeApi';

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

beforeEach(() => tokenStore.set(null));

describe('formularios de acceso', () => {
  it('avisa del correo mal escrito al salir del campo y no envía', async () => {
    const api = fakeFetch({});
    renderApp('/entrar');
    const email = await screen.findByLabelText('Correo');
    await userEvent.type(email, 'usuario@ejemplo');
    expect(screen.queryByText(/Ingresa un correo válido/)).not.toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByText('Ingresa un correo válido, como nombre@correo.com.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(screen.getByLabelText('Contraseña'), 'algo');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(api.calls).toHaveLength(0);
    expect(email).toHaveFocus();

    await userEvent.type(email, '.com');
    expect(screen.queryByText(/Ingresa un correo válido/)).not.toBeInTheDocument();
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('pide los campos vacíos en lugar de desactivar el botón', async () => {
    fakeFetch({});
    renderApp('/entrar');
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Escribe tu correo.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
  });

  it('muestra y oculta la contraseña', async () => {
    fakeFetch({});
    renderApp('/entrar');
    const input = await screen.findByLabelText('Contraseña');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(input).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('el registro enseña los requisitos al escribir y solo envía una contraseña que los cumple', async () => {
    const api = fakeFetch({ 'POST /api/auth/register': () => ({ token: 't1', user: USER }) });
    renderApp('/registro');
    const password = await screen.findByLabelText('Contraseña');
    expect(screen.queryByRole('list', { name: 'Requisitos de la contraseña' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Correo'), 'ana@example.com');
    await userEvent.type(password, 'clave');
    const rules = screen.getByRole('list', { name: 'Requisitos de la contraseña' });
    const done = () =>
      within(rules)
        .getAllByRole('listitem')
        .filter((li) => li.classList.contains('is-ok'))
        .map((li) => li.textContent?.replace(/:.*$/, ''));
    expect(done()).toEqual(['Una letra minúscula (a-z)']);

    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(screen.getByText('La contraseña todavía no cumple los requisitos.')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);

    await userEvent.type(password, 'Segura1');
    expect(done()).toEqual(['Mínimo 8 caracteres', 'Una letra mayúscula (A-Z)', 'Una letra minúscula (a-z)', 'Un número (0-9)']);
    expect(screen.queryByText('La contraseña todavía no cumple los requisitos.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(api.calls.find((c) => c.path === '/api/auth/register')?.body).toMatchObject({ email: 'ana@example.com', password: 'claveSegura1' });
  });
});

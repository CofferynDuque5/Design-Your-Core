import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { DEFAULT_PRICES, DEFAULT_PAYMENT_SETTINGS } from '@dyc/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeFetch, profile, USER } from '../test/fakeApi';
import { tokenStore } from '../app/api';
import { AppRoutes, makeQueryClient, Providers } from '../app/App';

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

const zelle = { ...DEFAULT_PAYMENT_SETTINGS.methods.find((m) => m.id === 'zelle')!, fields: [{ label: 'Correo o teléfono', value: 'pagos@example.com' }] };
const ve = { ...DEFAULT_PAYMENT_SETTINGS.methods[0], rate: 40, fields: [{ label: 'Banco', value: 'Banco de prueba' }] };

beforeEach(() => tokenStore.set('t1'));

describe('planes y pagos', () => {
  it('elige plan y método, ve el monto en su moneda y envía el comprobante', async () => {
    let sent: Record<string, unknown> | null = null;
    const api = fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/billing': () => ({
        plan: 'gratis', planUntil: null, admin: false, prices: DEFAULT_PRICES, methods: [ve, zelle],
        requests: sent ? [{ id: 'p1', plan: 'pro', period: 'mes', methodId: 've-bancos', methodName: 'Bancos venezolanos', currency: 'VES', amount: 159.6, amountUsd: 3.99, reference: '0012345', payerName: 'Ana', note: '', hasProof: false, status: 'pendiente', adminNote: '', createdAt: '2026-11-09T10:00:00Z', reviewedAt: null }] : [],
      }),
      'POST /api/v2/billing/requests': (b) => {
        sent = b as Record<string, unknown>;
        return [201, { request: {} }];
      },
    });
    const user = userEvent.setup();
    renderApp('/planes');
    await user.click(await screen.findByRole('button', { name: 'Elegir Pro' }));
    await user.click(screen.getByRole('radio', { name: /Bancos venezolanos/ }));
    expect(screen.getByText('Bs 159,60')).toBeInTheDocument();
    expect(screen.getByText('Banco de prueba')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Número de referencia'), '0012345');
    await user.type(screen.getByLabelText('Nombre de quien pagó'), 'Ana');
    // Sin comprobante avisa y no envía.
    await user.click(screen.getByRole('button', { name: 'Enviar para revisión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Adjunta la captura');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
    expect(screen.queryByRole('link', { name: /Administrar pagos/ })).toBeNull();
  });

  it('una cuenta sin permiso no ve la administración', async () => {
    fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/billing': () => ({ plan: 'pro', planUntil: '2027-11-09T00:00:00Z', admin: false, prices: DEFAULT_PRICES, methods: [], requests: [] }),
    });
    renderApp('/admin/pagos');
    expect(await screen.findByText('Esta sección es solo para la administración')).toBeInTheDocument();
  });

  it('el perfil muestra el plan vigente', async () => {
    fakeFetch({
      'GET /api/me': () => ({ user: USER }),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/partner': () => ({ partner: null }),
      'GET /api/partner': () => ({ partner: null, inviteCode: null }),
      'GET /api/v2/billing': () => ({ plan: 'pro', planUntil: '2027-11-09T12:00:00Z', admin: true, prices: DEFAULT_PRICES, methods: [], requests: [] }),
    });
    renderApp('/perfil');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tu plan: Pro' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Administrar pagos' })).toHaveAttribute('href', '/admin/pagos');
  });
});

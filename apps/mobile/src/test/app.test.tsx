import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { auth } from '../lib/api';
import { dashboard, fakeFetch, profile, tokens } from './fakeApi';

// Recorridos de la app con el enrutador real y una API falsa.
const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();

async function signIn() {
  await screen.findByText('Hola de nuevo');
  fireEvent.changeText(screen.getByLabelText('Correo'), 'ana@example.com');
  fireEvent.changeText(screen.getByLabelText('Contraseña'), 'una-clave-larga');
  fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
}

describe('app móvil', () => {
  beforeEach(async () => {
    await auth.signOut();
    reset();
  });

  it('entra, muestra el día y marca un hábito', async () => {
    const api = fakeFetch({
      'POST /api/v2/auth/session': () => tokens(),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      'GET /api/v2/dashboard': () => dashboard(),
      'PUT /api/v2/habits/:id/logs/:date': (b) => ({ log: { habitId: 'h1', date: '2026-09-23', ...(b as object) } }),
    });
    renderRouter('./src/app', { initialUrl: '/' });
    await signIn();

    expect(await screen.findByText('Hábitos de hoy')).toBeOnTheScreen();
    expect(api.calls.find((c) => c.path === '/api/v2/auth/session')?.body).toMatchObject({ email: 'ana@example.com' });
    expect(api.calls.find((c) => c.path === '/api/v2/dashboard')?.auth).toBe('Bearer acceso-1');
    expect(await SecureStore.getItemAsync('dyc.refresh')).toBe('renovacion-1');

    fireEvent.press(screen.getByRole('checkbox', { name: 'Caminar 10 minutos' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT' && c.path === '/api/v2/habits/h1/logs/2026-09-23')).toBe(true));
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toEqual({ done: true });
  });

  it('con la cuenta sin configurar empieza por la bienvenida', async () => {
    fakeFetch({
      'POST /api/v2/auth/session': () => tokens(),
      'GET /api/v2/profile': () => ({ profile: profile({ onboarded: false, focusPillars: [] }) }),
    });
    renderRouter('./src/app', { initialUrl: '/' });
    await signIn();
    expect(await screen.findByText(/Diseñemos tu forma de estar bien/)).toBeOnTheScreen();
  });

  it('muestra el error de la API al entrar con datos incorrectos', async () => {
    fakeFetch({ 'POST /api/v2/auth/session': () => [401, { error: 'Correo o contraseña incorrectos.' }] });
    renderRouter('./src/app', { initialUrl: '/' });
    await signIn();
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeOnTheScreen();
  });

  it('renueva el acceso caducado sin sacar a la persona', async () => {
    let dashCalls = 0;
    const api = fakeFetch({
      'POST /api/v2/auth/session': () => tokens(1),
      'POST /api/v2/auth/refresh': () => tokens(2),
      'GET /api/v2/profile': () => ({ profile: profile() }),
      // La primera vez el acceso ya caducó.
      'GET /api/v2/dashboard': () => (dashCalls++ === 0 ? [401, { error: 'Token inválido' }] : dashboard()),
    });
    renderRouter('./src/app', { initialUrl: '/' });
    await signIn();
    expect(await screen.findByText('Hábitos de hoy')).toBeOnTheScreen();
    expect(api.calls.find((c) => c.path === '/api/v2/auth/refresh')?.body).toEqual({ refreshToken: 'renovacion-1' });
    expect(api.calls.filter((c) => c.path === '/api/v2/dashboard').map((c) => c.auth)).toEqual(['Bearer acceso-1', 'Bearer acceso-2']);
    await act(async () => undefined);
  });
});

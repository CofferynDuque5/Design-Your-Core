import { ApiError, type TokenPair } from '@dyc/api-client';
import { createAuthStore } from './auth';
import type { KeyValueStore } from './storage';

const user = { id: 'u1', email: 'ana@example.com', name: 'Ana', gender: 'otro' as const, showCycle: false };
const pair = (n: number): TokenPair => ({ accessToken: `a${n}`, refreshToken: `r${n}`, expiresIn: 900, user });

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void (v === null ? data.delete(k) : data.set(k, v)),
  };
}

describe('sesión del móvil', () => {
  it('sin nada guardado arranca fuera y guarda la sesión al entrar', async () => {
    const store = memory();
    const auth = createAuthStore(store, jest.fn());
    await auth.load();
    expect(auth.get().status).toBe('signedOut');

    await auth.signIn(pair(1));
    expect(auth.accessToken()).toBe('a1');
    expect(store.data.get('dyc.refresh')).toBe('r1');

    // Al reabrir la app se recupera tal cual.
    const again = createAuthStore(store, jest.fn());
    await again.load();
    expect(again.get()).toMatchObject({ status: 'signedIn', accessToken: 'a1', refreshToken: 'r1', user: { name: 'Ana' } });
  });

  it('renueva el acceso y guarda el token de renovación nuevo', async () => {
    const store = memory();
    const renew = jest.fn(async () => pair(2));
    const auth = createAuthStore(store, renew);
    await auth.signIn(pair(1));

    await expect(auth.refresh()).resolves.toBe('a2');
    expect(renew).toHaveBeenCalledWith('r1');
    expect(store.data.get('dyc.refresh')).toBe('r2');
  });

  it('si la API rechaza la renovación, cierra la sesión', async () => {
    const store = memory();
    const auth = createAuthStore(store, async () => {
      throw new ApiError('Tu sesión caducó. Inicia sesión de nuevo.', 401);
    });
    await auth.signIn(pair(1));

    await expect(auth.refresh()).resolves.toBeNull();
    expect(auth.get().status).toBe('signedOut');
    expect(store.data.size).toBe(0);
  });

  it('sin conexión la sesión sigue abierta', async () => {
    const auth = createAuthStore(memory(), async () => {
      throw new ApiError('No hay conexión con el servidor.', 0);
    });
    await auth.signIn(pair(1));

    await expect(auth.refresh()).rejects.toThrow('No hay conexión');
    expect(auth.get().status).toBe('signedIn');
  });

  it('avisa a quien escucha cuando cambia', async () => {
    const auth = createAuthStore(memory(), jest.fn());
    const listener = jest.fn();
    const off = auth.subscribe(listener);
    await auth.signIn(pair(1));
    await auth.signOut();
    off();
    await auth.signIn(pair(2));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

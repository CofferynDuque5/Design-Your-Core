import { ApiError, type TokenPair, type User } from '@dyc/api-client';
import type { KeyValueStore } from './storage';

/**
 * Sesión del móvil: un token de acceso corto y uno de renovación que rota en
 * cada uso. Ambos viven en el llavero del sistema. Sin conexión la sesión se
 * conserva; solo se cierra si la API rechaza la renovación.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; accessToken: string; refreshToken: string; user: User };

const KEYS = { access: 'dyc.access', refresh: 'dyc.refresh', user: 'dyc.user' } as const;

export function createAuthStore(store: KeyValueStore, renew: (refreshToken: string) => Promise<TokenPair>) {
  let state: AuthState = { status: 'loading' };
  const listeners = new Set<() => void>();
  const set = (next: AuthState) => {
    state = next;
    listeners.forEach((l) => l());
  };

  async function signIn(pair: TokenPair) {
    await Promise.all([store.set(KEYS.access, pair.accessToken), store.set(KEYS.refresh, pair.refreshToken), store.set(KEYS.user, JSON.stringify(pair.user))]);
    set({ status: 'signedIn', accessToken: pair.accessToken, refreshToken: pair.refreshToken, user: pair.user });
  }

  async function signOut() {
    await Promise.all(Object.values(KEYS).map((k) => store.set(k, null))).catch(() => undefined);
    set({ status: 'signedOut' });
  }

  return {
    get: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    accessToken: () => (state.status === 'signedIn' ? state.accessToken : null),
    refreshToken: () => (state.status === 'signedIn' ? state.refreshToken : null),

    /** Lee la sesión guardada al abrir la app. */
    async load() {
      try {
        const [accessToken, refreshToken, rawUser] = await Promise.all([store.get(KEYS.access), store.get(KEYS.refresh), store.get(KEYS.user)]);
        const user = rawUser ? (JSON.parse(rawUser) as User) : null;
        if (accessToken && refreshToken && user) set({ status: 'signedIn', accessToken, refreshToken, user });
        else set({ status: 'signedOut' });
      } catch {
        set({ status: 'signedOut' });
      }
    },
    signIn,
    signOut,

    /**
     * Guarda los datos de la cuenta que cambiaron (mostrar Ciclo) sin tocar
     * los tokens. No hace nada si ya no hay sesión o es de otra persona.
     */
    async updateUser(user: User) {
      if (state.status !== 'signedIn' || state.user.id !== user.id) return;
      set({ ...state, user });
      await store.set(KEYS.user, JSON.stringify(user)).catch(() => undefined);
    },

    /**
     * Pide un token de acceso nuevo. Devuelve null (y cierra la sesión) si la
     * API la rechaza; si no hay red, lanza el error y la sesión sigue abierta.
     */
    async refresh(): Promise<string | null> {
      const current = state.status === 'signedIn' ? state.refreshToken : null;
      if (!current) return null;
      try {
        const pair = await renew(current);
        await signIn(pair);
        return pair.accessToken;
      } catch (e) {
        if (e instanceof ApiError && !e.isNetwork && e.status < 500) {
          await signOut();
          return null;
        }
        throw e;
      }
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;

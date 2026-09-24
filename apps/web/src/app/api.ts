import { createClient } from '@dyc/api-client';
import { read, write } from '../lib/storage';

const TOKEN_KEY = 'dyc.token';
let token: string | null = read(TOKEN_KEY);
const listeners = new Set<() => void>();

export const tokenStore = {
  get: () => token,
  set(next: string | null) {
    token = next;
    write(TOKEN_KEY, next);
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const api = createClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  getToken: () => token,
  // Token caducado o revocado: se cierra la sesión y se vuelve al acceso.
  onUnauthorized: () => tokenStore.set(null),
});

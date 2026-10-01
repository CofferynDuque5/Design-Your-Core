import { createClient } from '@dyc/api-client';
import { demoServer } from '../demo/server';
import { read, write } from '../lib/storage';

const TOKEN_KEY = 'dyc.token';
// Versión de prueba (VITE_DEMO): la API es falsa y vive en este navegador (src/demo/), y
// se empieza con la sesión de ejemplo abierta. En la app normal este código no se incluye.
const demo = import.meta.env.VITE_DEMO ? demoServer() : null;
let token: string | null = read(TOKEN_KEY);
if (demo) {
  token = demo.bootToken(token);
  write(TOKEN_KEY, token);
}
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
  ...(demo ? { fetch: demo.fetch } : {}),
});

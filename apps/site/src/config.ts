/** URL de la app web, sin barra final. En desarrollo, la app de `pnpm dev:web`. */
export const APP_URL = (import.meta.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/+$/, '');

export const appLink = (path: '/entrar' | '/registro' | '/') => `${APP_URL}${path}`;

import { describe, expect, it } from 'vitest';
import { isPlaceholderDatabaseUrl, loadConfig, normalizeDatabaseUrl, resolveSecret } from '../src/config.js';

describe('configuración', () => {
  it('normaliza la cadena de Neon', () => {
    expect(normalizeDatabaseUrl('postgresql://u:p@h/db?sslmode=require&channel_binding=require')).toBe('postgresql://u:p@h/db?sslmode=require');
    expect(normalizeDatabaseUrl('postgresql://u:p@ep-1-pooler.neon.tech/db?sslmode=require')).toBe('postgresql://u:p@ep-1-pooler.neon.tech/db?sslmode=require&pgbouncer=true');
  });

  it('detecta el valor de ejemplo', () => {
    expect(isPlaceholderDatabaseUrl('postgresql://USUARIO:CLAVE@ep-xxxx.neon.tech/neondb')).toBe(true);
    expect(isPlaceholderDatabaseUrl('')).toBe(true);
  });

  it('exige un secreto largo en producción', () => {
    expect(() => resolveSecret('corto', true)).toThrow();
    expect(resolveSecret('', false)).toMatch(/dev-secret/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow();
  });

  it('lee orígenes y dominios', () => {
    const c = loadConfig({ CLIENT_ORIGIN: 'https://a.com/, https://b.com', PUBLIC_URL: 'https://api.a.com/' });
    expect(c.clientOrigins).toEqual(['https://a.com', 'https://b.com']);
    expect(c.allowedRootDomains).toEqual(['nvcorx.com']);
    expect(c.publicUrl).toBe('https://api.a.com');
    expect(c.port).toBe(4600);
  });
});

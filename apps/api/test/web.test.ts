import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { fakeMailer, prisma, testConfig } from './helpers.js';

// Paquete de cPanel: la API sirve también la app web desde public/.
function withWeb() {
  const root = mkdtempSync(join(tmpdir(), 'dyc-web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Design Your Core</title><script>/*tema*/</script>');
  writeFileSync(join(root, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(root, 'sw.js'), 'self.addEventListener("fetch",()=>{})');
  return request(createApp({ prisma, config: testConfig(), mailer: fakeMailer(), webRoot: root }));
}

describe('web en el mismo dominio', () => {
  it('sirve la web y devuelve index.html en las rutas de la app', async () => {
    const api = withWeb();
    for (const path of ['/', '/entrar', '/habitos/nuevo']) {
      const res = await api.get(path).set('Accept', 'text/html').expect(200);
      expect(res.text).toContain('<title>Design Your Core</title>');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['content-security-policy']).toBeUndefined();
    }
  });

  it('cachea para siempre los archivos con huella y nunca el service worker', async () => {
    const api = withWeb();
    expect((await api.get('/assets/index-abc123.js').expect(200)).headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await api.get('/sw.js').expect(200)).headers['cache-control']).toBe('no-cache');
  });

  it('no tapa la API ni la página para elegir contraseña', async () => {
    const api = withWeb();
    expect((await api.get('/api/health').expect(200)).body).toEqual({ ok: true, service: 'core-cloud' });
    const missing = await api.get('/api/no-existe').set('Accept', 'text/html').expect(404);
    expect(missing.body).toEqual({ error: 'Recurso no encontrado' });
    const reset = await api.get('/reset?token=x').set('Accept', 'text/html');
    expect(reset.text).not.toContain('<title>Design Your Core</title>');
  });

  it('un archivo que no existe y no es HTML da 404', async () => {
    await withWeb().get('/logo-que-no-existe.png').set('Accept', 'image/png').expect(404);
  });

  it('sin carpeta web, la raíz no responde con la app', async () => {
    const res = await request(createApp({ prisma, config: testConfig(), mailer: fakeMailer() })).get('/entrar').set('Accept', 'text/html');
    expect(res.status).toBe(404);
  });
});

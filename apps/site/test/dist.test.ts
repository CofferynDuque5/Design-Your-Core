import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Revisa el sitio compilado (dist/): se ejecuta después de `pnpm build`.
const DIST = join(import.meta.dirname, '..', 'dist');
const pages = existsSync(DIST) ? readdirSync(DIST).filter((f) => f.endsWith('.html')) : [];
const html = (f: string) => readFileSync(join(DIST, f), 'utf8');
const attrs = (src: string, tag: string, attr: string) =>
  [...src.matchAll(new RegExp(`<${tag}\\b[^>]*\\s${attr}="([^"]*)"`, 'g'))].map((m) => m[1]);

describe('sitio compilado', () => {
  it('existe (ejecuta pnpm build antes)', () => {
    expect(pages).toEqual(expect.arrayContaining(['index.html', 'descargar.html', 'privacidad.html', 'condiciones.html', '404.html']));
  });

  it.each(pages)('%s tiene idioma, título, descripción y un solo h1', (f) => {
    const src = html(f);
    expect(src).toMatch(/<html lang="es"/);
    expect(src).toMatch(/<title>[^<]+<\/title>/);
    expect(src).toMatch(/<meta name="description" content="[^"]{30,}"/);
    expect(src.match(/<h1\b/g)).toHaveLength(1);
    expect(src).toContain('href="#main"');
    expect(src).toMatch(/<main id="main"/);
    // La URL canónica es la pública, igual que en el sitemap (sin .html).
    expect(src).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+"/);
    expect(src).not.toMatch(/<link rel="canonical" href="[^"]*\.html"/);
  });

  it.each(pages)('%s: los enlaces internos llevan a páginas y secciones que existen', (f) => {
    const ids = new Set(attrs(html('index.html'), '[a-z0-9]+', 'id'));
    for (const href of attrs(html(f), 'a', 'href')) {
      // Las apps de escritorio se suben aparte, a /descargas (ZIP de descargas).
      if (/^(https?:|mailto:)/.test(href) || href.startsWith('/descargas/')) continue;
      const [path, hash] = href.split('#');
      if (path && path !== '/') expect(existsSync(join(DIST, `${path.replace(/^\//, '')}.html`)), `${f} → ${href}`).toBe(true);
      if (hash) expect(ids.has(hash), `${f} → #${hash}`).toBe(true);
    }
  });

  it.each(pages)('%s: imágenes con texto alternativo e iconos ocultos a lectores de pantalla', (f) => {
    const src = html(f);
    for (const img of src.match(/<img\b[^>]*>/g) ?? []) expect(img).toMatch(/\salt="/);
    for (const svg of src.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toMatch(/aria-hidden="true"/);
  });

  it('los botones de la portada llevan a la app', () => {
    const hrefs = attrs(html('index.html'), 'a', 'href');
    expect(hrefs.some((h) => h.endsWith('/registro'))).toBe(true);
    expect(hrefs.some((h) => h.endsWith('/entrar'))).toBe(true);
  });

  it('enlaza las descargas de la computadora y la instalación en el teléfono', () => {
    const hrefs = attrs(html('descargar.html'), 'a', 'href');
    for (const f of ['DesignYourCore-Windows.exe', 'DesignYourCore-Mac-Apple.zip', 'DesignYourCore-Mac-Intel.zip', 'DesignYourCore-Linux.AppImage']) expect(hrefs).toContain(`/descargas/${f}`);
    expect(hrefs.some((h) => h.endsWith('/?instalar'))).toBe(true);
  });

  it('muestra todas las herramientas del catálogo de la app', () => {
    const src = html('index.html');
    for (const name of ['Agenda', 'Cursos', 'Notas', 'Asistente', 'Bóveda', 'Finanzas', 'Emprendimientos']) expect(src).toContain(`<strong>${name}</strong>`);
    expect(src).not.toContain('Respiración');
  });

  it('las capturas que usa el sitio existen', () => {
    for (const f of pages) for (const src of attrs(html(f), 'img', 'src')) if (src.startsWith('/')) expect(existsSync(join(DIST, src.slice(1))), `${f} → ${src}`).toBe(true);
  });

  it('muestra los seis pilares con un reto real del catálogo', () => {
    const src = html('index.html');
    for (const name of ['Energía y movimiento', 'Descanso', 'Alimentación', 'Enfoque mental', 'Relación de pareja', 'Propósito personal']) expect(src).toContain(name);
    expect(src.match(/Un reto para empezar/g)).toHaveLength(6);
  });
});

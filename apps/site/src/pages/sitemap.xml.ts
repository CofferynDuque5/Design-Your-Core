import type { APIRoute } from 'astro';

/** Mapa del sitio en la ruta clásica (/sitemap.xml); el de Astro sigue en /sitemap-index.xml. */
const PAGES = ['', '/descargar', '/privacidad', '/condiciones'];

export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'https://designyourcore.nvcorx.com/').replace(/\/+$/, '');
  const urls = PAGES.map((p) => `  <url><loc>${base}${p || '/'}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

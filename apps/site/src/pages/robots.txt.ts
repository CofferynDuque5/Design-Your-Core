import type { APIRoute } from 'astro';

/** Deja indexar todo el sitio y dice dónde está el mapa. */
export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'https://designyourcore.nvcorx.com/').replace(/\/+$/, '');
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

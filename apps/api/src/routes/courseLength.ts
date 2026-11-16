import { courseLengthSource, parseCourseLength } from '@dyc/core';
import { Router, type RequestHandler } from 'express';
import { ah } from '../lib/http.js';
import type { FetchPage } from '../lib/fetchPage.js';

/**
 * Cuánto dura un curso con solo su enlace: { url } → { seconds, exact, videos? }.
 * Lo hace el servidor porque el navegador y el teléfono no pueden leer otras páginas.
 */
export function courseLengthRoutes({ requireAuth, limit, fetchPage }: { requireAuth: RequestHandler; limit: RequestHandler; fetchPage: FetchPage }): Router {
  const r = Router();
  r.post('/courses/length', requireAuth, limit, ah(async (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 2000) : '';
    const source = url ? courseLengthSource(url) : null;
    if (!source) return res.status(400).json({ error: 'El enlace no es válido.' });
    let page: { status: number; body: string };
    try {
      page = await fetchPage(source.fetch);
    } catch {
      return res.status(502).json({ error: 'No pude abrir esa página. Escribe la duración a mano.' });
    }
    // Udemy a veces no deja usar su API: se prueba con la página del curso.
    if (source.kind === 'udemy' && page.status >= 400) {
      try {
        page = await fetchPage(url);
      } catch {
        /* se queda con la respuesta anterior */
      }
    }
    const found = page.status < 400 ? parseCourseLength(source.kind, page.body) : null;
    if (!found) return res.status(404).json({ error: 'Esa página no dice cuánto dura. Escribe la duración a mano.' });
    res.json(found);
  }));
  return r;
}

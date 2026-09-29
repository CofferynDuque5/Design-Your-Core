import express, { type Router } from 'express';
import { join } from 'node:path';

// App web en el mismo dominio que la API (paquete de cPanel): la carpeta public/ trae
// la web compilada. Los archivos se sirven tal cual y cualquier otra ruta que pida HTML
// (/entrar, /progreso…) devuelve index.html para que la resuelva el router de la web.
// Va después de /api y /reset, así que nunca los tapa.
const NO_CACHE = /(^|[\\/])(index\.html|sw\.js|manifest\.webmanifest)$/;
const HASHED = /[\\/]assets[\\/]/;

export function webRoutes(root: string): Router {
  const r = express.Router();
  // La web tiene un script en línea (tema antes de pintar) que la CSP por defecto de
  // helmet bloquearía; en el hosting estático tampoco se enviaba CSP.
  r.use((_req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    next();
  });
  r.use(
    express.static(root, {
      setHeaders(res, path) {
        res.setHeader('Cache-Control', NO_CACHE.test(path) ? 'no-cache' : HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      },
    }),
  );
  r.get('*', (req, res, next) => {
    if (!req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(join(root, 'index.html'));
  });
  return r;
}

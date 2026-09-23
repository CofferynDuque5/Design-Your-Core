import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Envuelve handlers async para que un error rechazado responda 500 en vez de
// dejar la petición colgada (Express 4 no captura promesas rechazadas).
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

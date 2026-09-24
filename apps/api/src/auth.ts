import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

const JWT_ISS = 'core-cloud';
const JWT_AUD = 'core-app';

interface TokenPayload {
  sub: string;
  ver?: number;
}

// El token lleva `ver` = tokenVersion del usuario en el momento de emitirlo.
// Si luego se incrementa tokenVersion (cambio de contraseña o "cerrar sesión en
// otros dispositivos"), los tokens antiguos dejan de validar.
export function createAuth(prisma: PrismaClient, secret: string) {
  // v1 usa tokens de 60 días; las sesiones renovables (v2) usan tokens de acceso cortos.
  const signToken = (userId: string, ver: number, expiresIn: jwt.SignOptions['expiresIn'] = '60d') =>
    jwt.sign({ sub: userId, ver }, secret, { algorithm: 'HS256', issuer: JWT_ISS, audience: JWT_AUD, expiresIn });

  const requireAuth: RequestHandler = (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }
    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: JWT_ISS, audience: JWT_AUD }) as TokenPayload;
    } catch {
      res.status(401).json({ error: 'Sesión inválida' });
      return;
    }
    // Comprueba que la versión del token siga vigente (sesión no revocada).
    prisma.user
      .findUnique({ where: { id: payload.sub }, select: { tokenVersion: true } })
      .then((u) => {
        if (!u || u.tokenVersion !== (payload.ver ?? 0)) {
          res.status(401).json({ error: 'Sesión cerrada. Inicia sesión de nuevo.' });
          return;
        }
        req.userId = payload.sub;
        next();
      })
      .catch(next);
  };

  return { signToken, requireAuth };
}

export type Auth = ReturnType<typeof createAuth>;

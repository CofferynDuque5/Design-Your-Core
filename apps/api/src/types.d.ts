declare global {
  namespace Express {
    interface Request {
      /** Id del usuario autenticado (lo fija requireAuth). */
      userId?: string;
    }
  }
}

export {};

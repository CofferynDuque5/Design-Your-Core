import type { PrismaClient } from '@prisma/client';
import type { Auth } from '../auth.js';
import { Router, type RequestHandler } from 'express';
import { accountRoutes } from './account.js';
import { challengeRoutes } from './challenges.js';
import { checkInRoutes } from './checkins.js';
import { dashboardRoutes } from './dashboard.js';
import { habitRoutes } from './habits.js';
import { profileRoutes } from './profile.js';
import { sessionRoutes } from './sessions.js';

/** API v2: pilares, check-ins, hábitos con historial, retos y recomendaciones. */
export function v2Routes(deps: { prisma: PrismaClient; auth: Auth; requireAuth: RequestHandler; strict: RequestHandler }): Router {
  const r = Router();
  r.use(sessionRoutes(deps));
  r.use(profileRoutes(deps));
  r.use(checkInRoutes(deps));
  r.use(habitRoutes(deps));
  r.use(challengeRoutes(deps));
  r.use(dashboardRoutes(deps));
  r.use(accountRoutes(deps));
  return r;
}

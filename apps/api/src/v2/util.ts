import { dateToDay, dayToDate, isDay, todayIn, type Day } from '@dyc/core';
import type { PrismaClient } from '@prisma/client';
import type { Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';

/** Valida con Zod; si falla responde 400 con el primer problema y devuelve null. */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown, res: Response): T | null {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const where = issue.path.length ? ` (${issue.path.join('.')})` : '';
  res.status(400).json({ error: `Datos inválidos${where}: ${issue.message}`, issues: r.error.issues });
  return null;
}

/** Lee un día de la URL; si no es válido responde 400. */
export function dayParam(value: unknown, res: Response): Day | null {
  if (isDay(value)) return value;
  res.status(400).json({ error: 'Fecha no válida (usa AAAA-MM-DD)' });
  return null;
}

export const toDb = (d: Day) => dayToDate(d);
export const fromDb = (d: Date) => dateToDay(d);

export async function userTimezone(prisma: PrismaClient, userId: string): Promise<string> {
  const p = await prisma.profile.findUnique({ where: { userId }, select: { timezone: true } });
  return p?.timezone || 'UTC';
}

export async function userToday(prisma: PrismaClient, userId: string): Promise<Day> {
  return todayIn(await userTimezone(prisma, userId));
}

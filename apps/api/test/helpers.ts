import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { ensureSchema } from '../src/db/ensureSchema.js';
import type { Mailer } from '../src/lib/mailer.js';

// Base de datos real de pruebas. Nunca apuntes esto a producción: se vacía en cada prueba.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/core_test';
process.env.DATABASE_URL = TEST_DATABASE_URL;

export const prisma = new PrismaClient();

export interface SentMail {
  kind: 'reset' | 'partner';
  to: string;
  link: string;
  inviter?: string;
}

export function fakeMailer(enabled = true): Mailer & { sent: SentMail[] } {
  const sent: SentMail[] = [];
  return {
    enabled,
    sent,
    async sendResetEmail(to, link) {
      sent.push({ kind: 'reset', to, link });
    },
    async sendPartnerEmail(to, link, inviter) {
      sent.push({ kind: 'partner', to, link, inviter });
    },
  };
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, JWT_SECRET: 'x'.repeat(48) }),
    clientOrigins: ['https://app.example.com'],
    allowedRootDomains: ['example.com'],
    publicUrl: 'https://api.example.com',
    ...overrides,
  };
}

export function makeApp(opts: { config?: Partial<Config>; mailer?: ReturnType<typeof fakeMailer>; strict?: number } = {}) {
  const mailer = opts.mailer ?? fakeMailer();
  const app = createApp({ prisma, config: testConfig(opts.config), mailer, limits: { general: 10_000, strict: opts.strict ?? 10_000 } });
  return { app, mailer, api: request(app) };
}

export async function resetDb() {
  await ensureSchema(prisma);
  await prisma.$executeRawUnsafe('TRUNCATE "Image", "Blob", "User" CASCADE');
}

let counter = 0;
export async function registerUser(api: ReturnType<typeof request>, data: Record<string, unknown> = {}) {
  counter++;
  const body = { email: `persona${counter}@example.com`, password: 'contraseña-segura', name: `Persona ${counter}`, ...data };
  const res = await api.post('/api/auth/register').send(body).expect(200);
  return { token: res.body.token as string, user: res.body.user, email: body.email as string, password: body.password as string };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

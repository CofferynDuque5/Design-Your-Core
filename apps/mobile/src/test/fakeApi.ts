import type { Dashboard, Profile, TokenPair } from '@dyc/api-client';
import { PILLAR_IDS } from '@dyc/core';

export type Handler = (body: unknown, url: URL) => [number, unknown] | unknown;

/** fetch falso: responde según "MÉTODO /ruta" y guarda cada llamada. */
export function fakeFetch(routes: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown; auth: string | null }> = [];
  const fn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method, path: url.pathname, body, auth: headers.Authorization ?? null });
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(' ');
      return m === method && new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+')}$`).test(url.pathname);
    });
    const out = key ? routes[key](body, url) : [404, { error: `Sin ruta falsa para ${method} ${url.pathname}` }];
    const [status, data] = Array.isArray(out) && typeof out[0] === 'number' ? (out as [number, unknown]) : [200, out];
    return { ok: status < 400, status, json: async () => data } as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return { calls, fn };
}

export const USER = { id: 'u1', email: 'ana@example.com', name: 'Ana Pérez', gender: 'mujer' as const, showCycle: false };

export const tokens = (n = 1): TokenPair => ({ accessToken: `acceso-${n}`, refreshToken: `renovacion-${n}`, expiresIn: 900, user: USER });

export const profile = (over: Partial<Profile> = {}): Profile => ({
  focusPillars: ['descanso'],
  intention: null,
  energyLevel: 3,
  activityLevel: 'ligera',
  wakeTime: '07:00',
  bedTime: '23:00',
  timezone: 'UTC',
  baseline: {},
  onboarded: true,
  onboardedAt: '2026-09-20T10:00:00.000Z',
  ...over,
});

export const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  period: 'week',
  date: '2026-09-23',
  today: '2026-09-23',
  range: { from: '2026-09-21', to: '2026-09-27' },
  previousRange: { from: '2026-09-14', to: '2026-09-20' },
  overall: { score: 62, previous: 55 },
  pillars: PILLAR_IDS.map((id) => ({ id, score: id === 'proposito' ? null : 60, previous: 50, delta: id === 'proposito' ? null : 10, daysWithData: 2 })),
  series: [],
  habits: { scheduled: 4, done: 2 },
  checkIns: { count: 2, streak: 2 },
  todayStatus: { checkIn: null, habits: [{ id: 'h1', title: 'Caminar 10 minutos', pillar: 'movimiento', done: false }] },
  challenges: [],
  recommendations: [],
  onboarded: true,
  ...over,
});

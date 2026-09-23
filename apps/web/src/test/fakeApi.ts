import type { Dashboard, Profile } from '@dyc/api-client';
import { PILLAR_IDS } from '@dyc/core';
import { vi } from 'vitest';

export type Handler = (body: unknown, url: URL) => [number, unknown] | unknown;

/** fetch falso: responde según "MÉTODO /ruta" y guarda cada llamada. */
export function fakeFetch(routes: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown; auth: string | null }> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    calls.push({ method, path: url.pathname, body, auth: headers.get('Authorization') });
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(' ');
      return m === method && new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+')}$`).test(url.pathname);
    });
    if (!key) return new Response(JSON.stringify({ error: `Sin ruta falsa para ${method} ${url.pathname}` }), { status: 404 });
    const out = routes[key](body, url);
    const [status, data] = Array.isArray(out) && typeof out[0] === 'number' ? (out as [number, unknown]) : [200, out];
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

export const USER = { id: 'u1', email: 'ana@example.com', name: 'Ana Pérez', gender: 'mujer' as const, showCycle: false };

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
  recommendations: [
    {
      key: 'sleep-short',
      kind: 'insight',
      pillar: 'descanso',
      title: 'Adelanta tu hora de dormir',
      body: 'Prueba acostarte 20 minutos antes.',
      reason: 'Dormiste 6 h de media esta semana.',
      priority: 1,
    },
  ],
  onboarded: true,
  ...over,
});

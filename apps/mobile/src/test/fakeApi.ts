import type { Dashboard, Profile, TokenPair } from '@dyc/api-client';
import { applyLegacyOp, legacyObject, PILLAR_IDS, type LegacyData, type LegacyItems, type LegacyKey, type LegacyObjectKey } from '@dyc/core';

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

/**
 * API falsa de las herramientas con el documento de la app anterior en
 * memoria: aplica cada cambio de /api/v2/modules como el servidor (con
 * `applyLegacyOp`, también los borrados en cascada) y guarda cada llamada.
 */
export function fakeModules(initial: LegacyData, over: Record<string, Handler> = {}) {
  let doc = initial;
  const parts = (url: URL) => url.pathname.split('/').slice(4) as [LegacyKey, string?];
  const api = fakeFetch({
    'GET /api/v2/profile': () => ({ profile: profile() }),
    'GET /api/v2/modules': () => ({ data: doc, updatedAt: '2026-09-26T10:00:00.000Z' }),
    'POST /api/v2/modules/:key': (b, url) => {
      const item = (b as { item: LegacyItems[LegacyKey] }).item;
      doc = applyLegacyOp(doc, parts(url)[0], { type: 'add', item });
      return [201, { item, updatedAt: 'x' }];
    },
    'PUT /api/v2/modules/:key/order': (b, url) => {
      doc = applyLegacyOp(doc, parts(url)[0], { type: 'reorder', ids: (b as { ids: string[] }).ids });
      return { ok: true, updatedAt: 'x' };
    },
    'PATCH /api/v2/modules/:key/:id': (b, url) => {
      const [key, id] = parts(url);
      doc = applyLegacyOp(doc, key, { type: 'update', id: decodeURIComponent(id ?? ''), patch: b as object });
      return { item: b, updatedAt: 'x' };
    },
    'DELETE /api/v2/modules/:key/:id': (_b, url) => {
      const [key, id] = parts(url);
      doc = applyLegacyOp(doc, key, { type: 'remove', id: decodeURIComponent(id ?? '') });
      return { ok: true, updatedAt: 'x' };
    },
    // Objetos (`cycle`, `dayLog`, `budget`): PATCH fusiona sobre lo guardado y los valores por defecto.
    'PATCH /api/v2/modules/:key': (b, url) => {
      const key = parts(url)[0] as unknown as LegacyObjectKey;
      const value = { ...legacyObject(doc, key), ...(b as object) };
      doc = { ...doc, [key]: value };
      return { value, updatedAt: 'x' };
    },
    // Ajustes de la cuenta (mostrar Ciclo).
    'PATCH /api/v2/me': (b) => ({ user: { ...USER, ...(b as object) } }),
    ...over,
  });
  return { ...api, doc: () => doc };
}

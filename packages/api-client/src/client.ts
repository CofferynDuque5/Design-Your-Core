import type { CheckInInput, Day, HabitInput, HabitPatch, Period, ProfileInput } from '@dyc/core';
import type { AccountExport, Challenge, CheckIn, Dashboard, Habit, PartnerView, Profile, Recommendation, Session, User, UserChallenge } from './types.js';

/** Error de la API con el mensaje listo para mostrar. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Sin conexión o el servidor no respondió. */
  get isNetwork() {
    return this.status === 0;
  }
}

export interface ClientOptions {
  baseUrl: string;
  /** Devuelve el token guardado (o null). */
  getToken: () => string | null | Promise<string | null>;
  /** Se llama cuando la sesión deja de ser válida (401 con token). */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function createClient(opts: ClientOptions) {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const token = await opts.getToken();
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.', 0);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && token) opts.onUnauthorized?.();
      const msg = (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' && data.error) || 'Algo salió mal. Inténtalo de nuevo.';
      throw new ApiError(msg, res.status, data);
    }
    return data as T;
  }

  const q = (params: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
    return s ? `?${s}` : '';
  };

  return {
    request,
    health: () => request<{ ok: boolean; service: string }>('GET', '/api/health'),

    auth: {
      register: (b: { email: string; password: string; name?: string; gender?: User['gender'] }) => request<Session>('POST', '/api/auth/register', b),
      login: (b: { email: string; password: string }) => request<Session>('POST', '/api/auth/login', b),
      me: () => request<{ user: User }>('GET', '/api/me').then((r) => r.user),
      forgotPassword: (email: string) => request<{ ok: true; message: string }>('POST', '/api/auth/forgot-password', { email }),
      changePassword: (current: string, next: string) => request<{ ok: true; token: string }>('POST', '/api/auth/change-password', { current, next }),
      logoutOthers: () => request<{ ok: true; token: string }>('POST', '/api/auth/logout-others'),
    },

    profile: {
      get: () => request<{ profile: Profile }>('GET', '/api/v2/profile').then((r) => r.profile),
      update: (b: ProfileInput) => request<{ profile: Profile }>('PUT', '/api/v2/profile', b).then((r) => r.profile),
    },

    checkIns: {
      list: (from?: Day, to?: Day) => request<{ from: Day; to: Day; checkIns: CheckIn[] }>('GET', `/api/v2/checkins${q({ from, to })}`),
      save: (date: Day, b: { [K in keyof CheckInInput]?: CheckInInput[K] | null }) =>
        request<{ checkIn: CheckIn }>('PUT', `/api/v2/checkins/${date}`, b).then((r) => r.checkIn),
      remove: (date: Day) => request<{ ok: true }>('DELETE', `/api/v2/checkins/${date}`),
    },

    habits: {
      list: (archived = false) => request<{ today: Day; habits: Habit[] }>('GET', `/api/v2/habits${archived ? '?archived=1' : ''}`),
      create: (b: Omit<HabitInput, 'days'> & { days?: string }) => request<{ habit: Habit }>('POST', '/api/v2/habits', b).then((r) => r.habit),
      update: (id: string, b: HabitPatch) => request<{ habit: Habit }>('PATCH', `/api/v2/habits/${id}`, b).then((r) => r.habit),
      remove: (id: string) => request<{ ok: true }>('DELETE', `/api/v2/habits/${id}`),
      log: (id: string, date: Day, done: boolean) => request<{ log: { habitId: string; date: Day; done: boolean } }>('PUT', `/api/v2/habits/${id}/logs/${date}`, { done }),
    },

    challenges: {
      catalog: () => request<{ challenges: Challenge[] }>('GET', '/api/v2/challenges/catalog').then((r) => r.challenges),
      list: () => request<{ today: Day; active: UserChallenge[]; past: UserChallenge[] }>('GET', '/api/v2/challenges'),
      start: (key: string, replaces?: string) => request<{ challenge: UserChallenge }>('POST', '/api/v2/challenges', { key, ...(replaces ? { replaces } : {}) }).then((r) => r.challenge),
      finish: (id: string, status: 'completed' | 'abandoned') => request<{ challenge: UserChallenge }>('PATCH', `/api/v2/challenges/${id}`, { status }).then((r) => r.challenge),
      log: (id: string, date: Day, done: boolean) => request<{ challenge: UserChallenge }>('PUT', `/api/v2/challenges/${id}/logs/${date}`, { done }).then((r) => r.challenge),
    },

    dashboard: (period: Period = 'week', date?: Day) => request<Dashboard>('GET', `/api/v2/dashboard${q({ period, date })}`),

    recommendations: {
      list: () => request<{ recommendations: Recommendation[] }>('GET', '/api/v2/recommendations').then((r) => r.recommendations),
      dismiss: (key: string) => request<{ ok: true; until: string }>('POST', `/api/v2/recommendations/${encodeURIComponent(key)}/dismiss`),
    },

    account: {
      export: () => request<AccountExport>('GET', '/api/v2/account/export'),
      remove: (password: string) => request<{ ok: true }>('DELETE', '/api/v2/account', { password }),
    },

    /** Datos de la app anterior (v1): un documento JSON por persona. Solo lectura desde la app nueva. */
    legacy: {
      get: () => request<{ data: Record<string, unknown>; updatedAt: string | null }>('GET', '/api/sync'),
    },

    partner: {
      get: () => request<PartnerView>('GET', '/api/partner'),
      invite: () => request<{ code: string }>('POST', '/api/partner/invite'),
      inviteByEmail: (email: string, appUrl: string) => request<{ ok: true; code: string; sent: boolean }>('POST', '/api/partner/invite/email', { email, appUrl }),
      accept: (code: string) => request<{ ok: true; partner: { name: string } }>('POST', '/api/partner/accept', { code }),
      remove: () => request<{ ok: true }>('DELETE', '/api/partner'),
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;

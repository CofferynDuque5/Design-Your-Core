import type { CheckIn, User } from '@dyc/api-client';
import { addDays, diffDays, isDay, type Day, type PillarId } from '@dyc/core';

/**
 * Base de datos de la versión de prueba: todo vive en memoria y se guarda en
 * el localStorage de este navegador (si se puede). Nada sale del navegador.
 */

export const DB_KEY = 'dyc.demo.db';
export const DB_VERSION = 1;

export interface DemoHabit {
  id: string;
  title: string;
  pillar: PillarId;
  days: string;
  startsOn: Day;
  archivedAt: string | null;
  createdAt: string;
  /** Registro por día: true = cumplido. */
  logs: Record<Day, boolean>;
}

export interface DemoChallenge {
  id: string;
  key: string;
  pillar: PillarId;
  startedOn: Day;
  durationDays: number;
  status: 'active' | 'completed' | 'abandoned';
  endedAt: string | null;
  logs: Record<Day, boolean>;
}

export interface DemoProfile {
  focusPillars: PillarId[];
  intention: string | null;
  energyLevel: number | null;
  activityLevel: 'sedentaria' | 'ligera' | 'moderada' | 'alta' | null;
  wakeTime: string | null;
  bedTime: string | null;
  timezone: string;
  baseline: Partial<Record<PillarId, number>>;
  onboardedAt: string | null;
}

export interface DemoAccount {
  user: User;
  profile: DemoProfile | null;
  checkIns: Record<Day, CheckIn>;
  habits: DemoHabit[];
  challenges: DemoChallenge[];
  /** Recomendaciones ocultas: clave → hasta cuándo (ISO). */
  dismissals: Record<string, string>;
  /** Documento de la app anterior (/api/sync y /api/v2/modules). */
  blob: { data: Record<string, unknown>; updatedAt: string | null };
  images: Record<string, string>;
  inviteCode: string | null;
  partner: { name: string } | null;
}

export interface DemoDb {
  version: number;
  /** Día (local) en que se sembraron o se movieron por última vez las fechas. */
  baseDay: Day;
  accounts: DemoAccount[];
  /** Token de sesión → id de la cuenta. */
  tokens: Record<string, string>;
}

/** Zona horaria de este navegador (la del perfil de ejemplo). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}


/** Id aleatorio corto (letras y números), como los de la base de datos real. */
export function demoId(prefix = ''): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw = typeof c?.randomUUID === 'function' ? c.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}${raw.slice(0, 24)}`;
}

// ---------- Almacenamiento (puede fallar: modo privado, iframes sin permisos) ----------

export interface DemoStorage {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

export const browserStorage: DemoStorage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Sin almacenamiento: los datos duran lo que dure la pestaña.
    }
  },
};

export const memoryStorage = (): DemoStorage => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => (v === null ? m.delete(k) : m.set(k, v)) };
};

export function loadDb(storage: DemoStorage): DemoDb | null {
  const raw = storage.get(DB_KEY);
  if (!raw) return null;
  try {
    const db = JSON.parse(raw) as DemoDb;
    if (!db || db.version !== DB_VERSION || !Array.isArray(db.accounts) || !isDay(db.baseDay) || typeof db.tokens !== 'object') return null;
    return db;
  } catch {
    return null;
  }
}

export function saveDb(storage: DemoStorage, db: DemoDb): void {
  storage.set(DB_KEY, JSON.stringify(db));
}

// ---------- Fechas que avanzan con el calendario ----------

const shiftRecord = <T>(rec: Record<Day, T>, n: number): Record<Day, T> => Object.fromEntries(Object.entries(rec).map(([d, v]) => [isDay(d) ? addDays(d, n) : d, v]));

/** Mueve cualquier fecha AAAA-MM-DD de un valor (listas y objetos anidados). */
function shiftDeep(v: unknown, n: number): unknown {
  if (typeof v === 'string') return isDay(v) ? addDays(v, n) : v;
  if (Array.isArray(v)) return v.map((x) => shiftDeep(x, n));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftDeep(x, n)]));
  return v;
}

/**
 * Si la prueba se abre otro día, todas las fechas se mueven los mismos días:
 * los datos de ejemplo siguen siendo «de esta semana». Las fechas con hora
 * (creación, cambios) no se tocan.
 */
export function rebaseDb(db: DemoDb, today: Day): DemoDb {
  const n = diffDays(db.baseDay, today);
  if (!n) return db;
  return {
    ...db,
    baseDay: today,
    accounts: db.accounts.map((a) => ({
      ...a,
      checkIns: Object.fromEntries(Object.values(a.checkIns).map((c) => {
        const date = addDays(c.date, n);
        return [date, { ...c, date }];
      })),
      habits: a.habits.map((h) => ({ ...h, startsOn: addDays(h.startsOn, n), logs: shiftRecord(h.logs, n) })),
      challenges: a.challenges.map((c) => ({ ...c, startedOn: addDays(c.startedOn, n), logs: shiftRecord(c.logs, n) })),
      blob: { ...a.blob, data: shiftDeep(a.blob.data, n) as Record<string, unknown> },
    })),
  };
}

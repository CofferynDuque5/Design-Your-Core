import type { CheckIn, Habit, PartnerView, UserChallenge } from '@dyc/api-client';
import {
  accountDeleteSchema,
  addDays,
  averageScores,
  challengeByKey,
  challengePatchSchema,
  challengeStartSchema,
  CHALLENGES,
  checkInInputSchema,
  dayScores,
  daysIn,
  deriveLegacyPatch,
  diffDays,
  habitInputSchema,
  habitPatchSchema,
  isDay,
  isLegacyKey,
  isLegacyObjectKey,
  isPillarId,
  isScheduled,
  LEGACY_CHILDREN,
  LEGACY_CROSS,
  LEGACY_NEWEST_FIRST,
  LEGACY_PARENT,
  LEGACY_UNIQUE,
  legacyItemSchemas,
  legacyList,
  legacyObjectDefaults,
  legacyObjectPatchSchemas,
  legacyObjectSchemas,
  legacyPatchSchemas,
  legacyReorderSchema,
  logInputSchema,
  mergeLegacyItem,
  overallScore,
  periodRange,
  periodSchema,
  PILLAR_IDS,
  pillarRecord,
  previousRange,
  profileInputSchema,
  recommend,
  reorderById,
  todayIn,
  userSettingsSchema,
  VAULT_MAX_ITEMS,
  vaultItemPatchSchema,
  vaultItemSchema,
  vaultMigrateSchema,
  vaultSecureSchema,
  type Day,
  type HabitDay,
  type LegacyKey,
  type PillarId,
  type PillarScores,
  type Range,
} from '@dyc/core';
import { browserStorage, browserTimeZone, DB_KEY, demoId, loadDb, rebaseDb, saveDb, type DemoAccount, type DemoChallenge, type DemoDb, type DemoHabit, type DemoStorage } from './db';
import { emptyAccount, SAMPLE_TOKEN, seedDb } from './seed';

/**
 * API falsa de la versión de prueba. Responde a las mismas rutas que la API
 * real (apps/api/src/routes y apps/api/src/v2) con las mismas formas y las
 * mismas reglas, pero sobre la base de datos del navegador (./db.ts). La web
 * la usa como `fetch` de @dyc/api-client (ver src/app/api.ts).
 */

type Doc = Record<string, unknown>;
type Item = Record<string, unknown> & { id: string };
type Result = [number, unknown];

/** Error con respuesta HTTP (como HttpError en la API real). */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Doc = {},
  ) {
    super(message);
  }
}

const fail = (status: number, error: string, extra: Doc = {}): never => {
  throw new HttpError(status, error, extra);
};

/** Lo que se usa de un esquema de Zod (la web no depende de Zod directamente). */
interface Schema<T> {
  safeParse(input: unknown): { success: boolean; data?: T; error?: { issues: Array<{ path: Array<string | number>; message: string }> } };
}

/** Valida con Zod; si falla, 400 con el primer problema (igual que `parse` de la API). */
function parse<T>(schema: Schema<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data as T;
  const issues = r.error?.issues ?? [];
  const issue = issues[0] ?? { path: [], message: 'formato no válido' };
  const where = issue.path.length ? ` (${issue.path.join('.')})` : '';
  return fail(400, `Datos inválidos${where}: ${issue.message}`, { issues });
}

const dayParam = (v: string): Day => (isDay(v) ? v : fail(400, 'Fecha no válida (usa AAAA-MM-DD)'));
const rawList = (doc: Doc, key: string): Item[] => (Array.isArray(doc[key]) ? (doc[key] as Item[]) : []);
const idOf = (x: unknown) => (x && typeof x === 'object' ? (x as { id?: unknown }).id : undefined);
const isObj = (x: unknown): x is Doc => !!x && typeof x === 'object' && !Array.isArray(x);

// ---------- Formas públicas (como publicX en la API) ----------

const publicUser = (a: DemoAccount) => ({ ...a.user, gender: a.user.gender ?? 'otro', showCycle: !!a.user.showCycle });

function publicProfile(a: DemoAccount) {
  const p = a.profile;
  return {
    focusPillars: (p?.focusPillars ?? []).filter(isPillarId) as PillarId[],
    intention: p?.intention ?? null,
    energyLevel: p?.energyLevel ?? null,
    activityLevel: p?.activityLevel ?? null,
    wakeTime: p?.wakeTime ?? null,
    bedTime: p?.bedTime ?? null,
    timezone: p?.timezone ?? 'UTC',
    baseline: p?.baseline ?? {},
    onboarded: !!p?.onboardedAt,
    onboardedAt: p?.onboardedAt ?? null,
  };
}

const publicHabit = (h: DemoHabit): Habit => ({
  id: h.id,
  title: h.title,
  pillar: h.pillar,
  days: h.days,
  startsOn: h.startsOn,
  archived: !!h.archivedAt,
  createdAt: h.createdAt,
});

const logList = (logs: Record<Day, boolean>, from?: Day, to?: Day) =>
  Object.entries(logs)
    .filter(([d]) => (!from || d >= from) && (!to || d <= to))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, done]) => ({ date, done }));

function challengeProgress(c: DemoChallenge, today: Day): UserChallenge {
  const endsOn = addDays(c.startedOn, c.durationDays - 1);
  const catalog = challengeByKey(c.key);
  const log = logList(c.logs);
  return {
    id: c.id,
    key: c.key,
    pillar: c.pillar,
    title: catalog?.title ?? c.key,
    description: catalog?.description ?? '',
    level: catalog?.level ?? null,
    status: c.status,
    startedOn: c.startedOn,
    endsOn,
    durationDays: c.durationDays,
    dayNumber: Math.max(0, Math.min(diffDays(c.startedOn, today) + 1, c.durationDays)),
    doneDays: log.filter((l) => l.done).length,
    doneToday: !!c.logs[today],
    log,
  };
}

// ---------- Puntuaciones (como v2/insights.ts) ----------

function habitsOn(a: DemoAccount, d: Day): Array<HabitDay & { id: string; title: string }> {
  return a.habits
    .filter((h) => h.startsOn <= d && (!h.archivedAt || h.archivedAt.slice(0, 10) > d) && isScheduled(h.days, d))
    .map((h) => ({ id: h.id, title: h.title, pillar: h.pillar, done: !!h.logs[d] }));
}

function scoreDays(a: DemoAccount, days: Day[], today: Day): Map<Day, PillarScores> {
  const out = new Map<Day, PillarScores>();
  for (const d of days) out.set(d, d > today ? pillarRecord(() => null) : dayScores(a.checkIns[d], habitsOn(a, d)));
  return out;
}

function summarize(scores: Map<Day, PillarScores>, range: Range) {
  const { scores: avg, daysWithData } = averageScores(daysIn(range).map((d) => scores.get(d) ?? pillarRecord(() => null)));
  return { scores: avg, daysWithData, overall: overallScore(avg) };
}

function checkInStreak(dates: Set<Day>, today: Day): number {
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- Servidor ----------

export interface DemoServerOptions {
  storage?: DemoStorage;
  /** Espera artificial por petición (ms), para que se vean los estados de carga. */
  latency?: number;
  /** Reloj (pruebas). */
  now?: () => Date;
}

export function createDemoServer(opts: DemoServerOptions = {}) {
  const storage = opts.storage ?? browserStorage;
  const latency = opts.latency ?? 0;
  const now = opts.now ?? (() => new Date());
  const tz = browserTimeZone();
  let db: DemoDb | null = null;
  let fresh = false;

  function seed(): DemoDb {
    const d = now();
    return seedDb({ today: todayIn(tz, d), utcToday: d.toISOString().slice(0, 10), timezone: tz, now: d });
  }

  /** Carga (o siembra) la base de datos y mueve las fechas si hoy es otro día. */
  function current(): DemoDb {
    if (!db) {
      const stored = loadDb(storage);
      fresh = !stored;
      db = stored ?? seed();
      if (fresh) saveDb(storage, db);
    }
    const today = todayIn(tz, now());
    if (db.baseDay !== today) {
      db = rebaseDb(db, today);
      saveDb(storage, db);
    }
    return db;
  }

  const persist = () => db && saveDb(storage, db);

  function account(token: string | null): DemoAccount {
    const d = current();
    const id = token ? d.tokens[token] : undefined;
    const a = id ? d.accounts.find((x) => x.user.id === id) : undefined;
    if (!token) return fail(401, 'No autenticado');
    if (!a) return fail(401, 'Sesión cerrada. Inicia sesión de nuevo.');
    return a;
  }

  const userToday = (a: DemoAccount) => todayIn(a.profile?.timezone || 'UTC', now());
  const stamp = () => now().toISOString();

  function newToken(a: DemoAccount): string {
    const t = `demo-${demoId()}`;
    current().tokens[t] = a.user.id;
    return t;
  }

  /** Revoca todas las sesiones de la cuenta y da una nueva (como subir tokenVersion). */
  function rotateTokens(a: DemoAccount): string {
    const d = current();
    for (const [t, id] of Object.entries(d.tokens)) if (id === a.user.id) delete d.tokens[t];
    return newToken(a);
  }

  // ----- Retos -----

  function settleChallenges(a: DemoAccount, today: Day) {
    for (const c of a.challenges) {
      if (c.status === 'active' && addDays(c.startedOn, c.durationDays - 1) < today) {
        c.status = 'completed';
        c.endedAt = stamp();
      }
    }
  }

  function activeChallenges(a: DemoAccount, today: Day) {
    settleChallenges(a, today);
    return a.challenges
      .filter((c) => c.status === 'active')
      .sort((x, y) => (x.startedOn < y.startedOn ? -1 : x.startedOn > y.startedOn ? 1 : 0))
      .map((c) => challengeProgress(c, today));
  }

  function recommendationsFor(a: DemoAccount, today: Day) {
    const nowMs = now().getTime();
    const dismissed = new Set(Object.entries(a.dismissals).filter(([, until]) => new Date(until).getTime() > nowMs).map(([k]) => k));
    const active = activeChallenges(a, today);
    const from = addDays(today, -13);
    const week = { from: addDays(today, -6), to: today };
    const weekScores = summarize(scoreDays(a, daysIn(week), today), week).scores;
    return recommend({
      today,
      focusPillars: (a.profile?.focusPillars ?? []).filter(isPillarId) as PillarId[],
      checkIns: Object.values(a.checkIns).filter((c) => c.date >= from && c.date <= today),
      weekScores,
      activeChallenges: active.map((c) => ({ id: c.id, key: c.key, startedOn: c.startedOn, durationDays: c.durationDays, doneDays: c.doneDays })),
      dismissed,
    });
  }

  // ----- Documento de la app anterior (módulos) -----

  /** Cambia el documento: `set` sustituye claves y `unset` las quita; el resto se conserva. */
  function withDoc<T>(a: DemoAccount, fn: (doc: Doc) => { set: Doc; unset?: string[]; result: T }) {
    const doc = isObj(a.blob.data) ? a.blob.data : {};
    const { set, unset = [], result } = fn(doc);
    a.blob.data = Object.fromEntries(Object.entries({ ...doc, ...set }).filter(([k]) => !unset.includes(k)));
    a.blob.updatedAt = stamp();
    return { result, updatedAt: a.blob.updatedAt };
  }

  const edit = <T>(a: DemoAccount, key: LegacyKey, fn: (list: Item[], doc: Doc) => { list: Item[]; result: T; also?: Doc }) =>
    withDoc(a, (doc) => {
      const { list, result, also } = fn(rawList(doc, key), doc);
      return { set: { ...also, [key]: list }, result };
    });

  const ids = (doc: Doc, key: LegacyKey) => new Set(legacyList(doc, key).map((x) => (x as { id: string }).id));

  const checkRelations = (key: LegacyKey, item: Doc, doc: Doc) => {
    const parent = LEGACY_PARENT[key];
    const ref = parent ? item[parent.field] : undefined;
    if (parent && typeof ref === 'string' && !ids(doc, parent.key).has(ref)) fail(400, parent.missing);
    if (key === 'classes' && typeof item.subject === 'string' && item.subject) {
      const subjects = Array.isArray(doc.subjects) ? (doc.subjects as Array<{ id?: unknown }>) : [];
      if (!subjects.some((s) => s && s.id === item.subject)) fail(400, 'La materia no existe');
    }
  };

  const checkUnique = (key: LegacyKey, item: Doc, list: Item[], id: string) => {
    const unique = LEGACY_UNIQUE[key];
    if (unique && unique.field in item && list.some((x) => x && idOf(x) !== id && x[unique.field] === item[unique.field])) fail(409, unique.message);
  };

  const vaultOf = (doc: Doc) => (isObj(doc.vaultSecure) ? (doc.vaultSecure as Doc & { items?: unknown }) : null);
  const vaultItems = (v: Doc & { items?: unknown }) => (Array.isArray(v.items) ? (v.items as Item[]) : []);

  const editVault = <T>(a: DemoAccount, fn: (items: Item[], doc: Doc) => { items: Item[]; result: T; also?: Doc }) =>
    withDoc(a, (doc) => {
      const vault = vaultOf(doc);
      if (!vault) fail(404, 'Aún no has creado la bóveda');
      const { items, result, also } = fn(vaultItems(vault as Doc), doc);
      if (items.length > VAULT_MAX_ITEMS) fail(400, `La bóveda admite hasta ${VAULT_MAX_ITEMS} entradas`);
      return { set: { ...also, vaultSecure: { ...vault, items } }, result };
    });

  // ----- Rutas -----

  type Ctx = { body: Doc; query: URLSearchParams; params: string[]; token: string | null };
  type Handler = (c: Ctx) => Result | unknown;
  const routes: Array<{ method: string; re: RegExp; handler: Handler; open: boolean }> = [];
  /** Registra una ruta; como en la API, todas piden sesión salvo las de acceso (`open`). */
  const on = (method: string, path: string, handler: Handler, open = false) => {
    routes.push({ method, re: new RegExp(`^${path.replace(/:[a-zA-Z]+/g, '([^/]+)')}$`), handler, open });
  };
  const created = (data: unknown): Result => [201, data];

  on('GET', '/api/health', () => ({ ok: true, service: 'design-your-core (prueba)' }), true);

  // Acceso. En la prueba vale cualquier correo y contraseña.
  on('POST', '/api/auth/register', ({ body }) => {
    const email = String(body.email ?? '').toLowerCase().trim();
    const password = String(body.password ?? '');
    const gender = body.gender === 'mujer' || body.gender === 'hombre' ? body.gender : 'otro';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 200) fail(400, 'Datos inválidos (email válido y contraseña de 8+ caracteres)');
    const d = current();
    if (d.accounts.some((a) => a.user.email === email)) fail(409, 'Ya existe una cuenta con ese correo');
    const name = (typeof body.name === 'string' && body.name.trim() ? body.name : email.split('@')[0]).trim().slice(0, 80);
    const a = emptyAccount(demoId('u'), email, name, gender);
    d.accounts.push(a);
    return { token: newToken(a), user: publicUser(a) };
  }, true);

  on('POST', '/api/auth/login', ({ body }) => {
    const email = String(body.email ?? '').toLowerCase().trim();
    if (!email || !body.password) fail(400, 'Datos inválidos');
    const d = current();
    // Un correo registrado en esta prueba entra en su cuenta; cualquier otro, en la de ejemplo.
    let a = d.accounts.find((x) => x.user.email === email) ?? d.accounts[0];
    if (!a) {
      const s = seed();
      d.accounts.push(...s.accounts);
      a = d.accounts[0];
    }
    return { token: newToken(a), user: publicUser(a) };
  }, true);

  on('GET', '/api/me', ({ token }) => ({ user: publicUser(account(token)) }));

  on('POST', '/api/auth/change-password', ({ token, body }) => {
    const a = account(token);
    if (typeof body.current !== 'string' || !body.current || typeof body.next !== 'string' || body.next.length < 8 || body.next.length > 200) {
      fail(400, 'La nueva contraseña debe tener 8+ caracteres');
    }
    return { ok: true, token: rotateTokens(a) };
  });

  on('POST', '/api/auth/logout-others', ({ token }) => ({ ok: true, token: rotateTokens(account(token)) }));

  on('POST', '/api/auth/forgot-password', () => ({ ok: true, message: 'Si el correo existe, te enviamos un enlace para restablecer la contraseña.' }), true);

  // Perfil y ajustes.
  on('GET', '/api/v2/profile', ({ token }) => ({ profile: publicProfile(account(token)) }));

  on('PUT', '/api/v2/profile', ({ token, body }) => {
    const a = account(token);
    const input = parse(profileInputSchema, body);
    const { completeOnboarding, baseline, ...fields } = input;
    const p = a.profile ?? { focusPillars: [], intention: null, energyLevel: null, activityLevel: null, wakeTime: null, bedTime: null, timezone: 'UTC', baseline: {}, onboardedAt: null };
    a.profile = {
      ...p,
      ...fields,
      baseline: baseline ? { ...p.baseline, ...baseline } : p.baseline,
      onboardedAt: completeOnboarding && !p.onboardedAt ? stamp() : p.onboardedAt,
    };
    return { profile: publicProfile(a) };
  });

  on('PATCH', '/api/v2/me', ({ token, body }) => {
    const a = account(token);
    const input = parse(userSettingsSchema, body);
    a.user = { ...a.user, showCycle: input.showCycle };
    return { user: publicUser(a) };
  });

  // Check-ins.
  on('GET', '/api/v2/checkins', ({ token, query }) => {
    const a = account(token);
    const qTo = query.get('to');
    const qFrom = query.get('from');
    const to: Day = isDay(qTo) ? qTo : userToday(a);
    const from: Day = isDay(qFrom) ? qFrom : addDays(to, -29);
    if (from > to || addDays(from, 366) < to) fail(400, 'Rango de fechas no válido (máximo un año)');
    const checkIns = Object.values(a.checkIns)
      .filter((c) => c.date >= from && c.date <= to)
      .sort((x, y) => (x.date < y.date ? -1 : 1));
    return { from, to, checkIns };
  });

  on('PUT', '/api/v2/checkins/:date', ({ token, params, body }) => {
    const date = dayParam(params[0]);
    const a = account(token);
    if (date > addDays(userToday(a), 1)) fail(400, 'No se puede registrar un día futuro');
    const values = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null));
    const nulls = Object.fromEntries(Object.entries(body).filter(([, v]) => v === null).map(([k]) => [k, null]));
    const input = parse(checkInInputSchema, values);
    const unknownNull = Object.keys(nulls).find((k) => !(k in checkInInputSchema.shape));
    if (unknownNull) fail(400, `Campo desconocido: ${unknownNull}`);
    const empty: Omit<CheckIn, 'date' | 'updatedAt'> = {
      mood: null,
      energy: null,
      stress: null,
      sleepHours: null,
      sleepQuality: null,
      activeMinutes: null,
      nutrition: null,
      water: null,
      connection: null,
      purpose: null,
      note: null,
      gratitude: null,
    };
    const before = a.checkIns[date];
    const saved: CheckIn = { ...empty, ...(before ?? {}), ...input, ...(before ? nulls : {}), date, updatedAt: stamp() };
    a.checkIns[date] = saved;
    return { checkIn: saved };
  });

  on('DELETE', '/api/v2/checkins/:date', ({ token, params }) => {
    const date = dayParam(params[0]);
    delete account(token).checkIns[date];
    return { ok: true };
  });

  // Hábitos.
  on('GET', '/api/v2/habits', ({ token, query }) => {
    const a = account(token);
    const today = userToday(a);
    const list = a.habits.filter((h) => query.get('archived') === '1' || !h.archivedAt).sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1));
    return { today, habits: list.map((h) => ({ ...publicHabit(h), recent: logList(h.logs, addDays(today, -6), today) })) };
  });

  on('POST', '/api/v2/habits', ({ token, body }) => {
    const input = parse(habitInputSchema, body);
    const a = account(token);
    if (a.habits.filter((h) => !h.archivedAt).length >= 30) fail(409, 'Tienes 30 hábitos activos. Archiva alguno antes de crear otro.');
    const habit: DemoHabit = { id: demoId('h'), ...input, startsOn: userToday(a), archivedAt: null, createdAt: stamp(), logs: {} };
    a.habits.push(habit);
    return created({ habit: publicHabit(habit) });
  });

  const ownHabit = (a: DemoAccount, id: string) => a.habits.find((h) => h.id === id) ?? fail(404, 'Hábito no encontrado');

  on('PATCH', '/api/v2/habits/:id', ({ token, params, body }) => {
    const input = parse(habitPatchSchema, body);
    const h = ownHabit(account(token), params[0]);
    const { archived, ...fields } = input;
    Object.assign(h, fields);
    if (archived !== undefined) h.archivedAt = archived ? (h.archivedAt ?? stamp()) : null;
    return { habit: publicHabit(h) };
  });

  on('DELETE', '/api/v2/habits/:id', ({ token, params }) => {
    const a = account(token);
    const h = ownHabit(a, params[0]);
    a.habits = a.habits.filter((x) => x !== h);
    return { ok: true };
  });

  on('PUT', '/api/v2/habits/:id/logs/:date', ({ token, params, body }) => {
    const date = dayParam(params[1]);
    const input = parse(logInputSchema, body);
    const a = account(token);
    const h = ownHabit(a, params[0]);
    if (date > addDays(userToday(a), 1)) fail(400, 'No se puede registrar un día futuro');
    h.logs[date] = input.done;
    return { log: { habitId: h.id, date, done: input.done } };
  });

  // Retos.
  on('GET', '/api/v2/challenges/catalog', () => ({ challenges: CHALLENGES }));

  on('GET', '/api/v2/challenges', ({ token }) => {
    const a = account(token);
    const today = userToday(a);
    const active = activeChallenges(a, today);
    const past = a.challenges
      .filter((c) => c.status !== 'active' && c.startedOn >= addDays(today, -60))
      .sort((x, y) => (x.startedOn < y.startedOn ? 1 : -1))
      .map((c) => challengeProgress(c, today));
    return { today, active, past };
  });

  on('POST', '/api/v2/challenges', ({ token, body }) => {
    const input = parse(challengeStartSchema, body);
    const a = account(token);
    const catalog = challengeByKey(input.key) ?? fail(404, 'Ese reto no existe');
    const today = userToday(a);
    settleChallenges(a, today);
    const startOn = input.startOn ?? today;
    if (startOn < addDays(today, -1) || startOn > addDays(today, 7)) fail(400, 'El reto debe empezar entre ayer y dentro de una semana');
    const active = a.challenges.filter((c) => c.status === 'active');
    const replaced = input.replaces ? active.find((c) => c.id === input.replaces) : undefined;
    if (input.replaces && !replaced) fail(404, 'El reto a reemplazar no está activo');
    if (active.some((c) => c.key === catalog.key && c.id !== replaced?.id)) fail(409, 'Ya tienes este reto activo');
    if (!replaced && active.length >= 3) fail(409, 'Puedes tener hasta 3 retos a la vez. Termina o deja uno antes de empezar otro.');
    if (replaced) {
      replaced.status = 'abandoned';
      replaced.endedAt = stamp();
    }
    const c: DemoChallenge = { id: demoId('c'), key: catalog.key, pillar: catalog.pillar, startedOn: startOn, durationDays: catalog.durationDays, status: 'active', endedAt: null, logs: {} };
    a.challenges.push(c);
    return created({ challenge: challengeProgress(c, today) });
  });

  const ownChallenge = (a: DemoAccount, id: string) => a.challenges.find((c) => c.id === id) ?? fail(404, 'Reto no encontrado');

  on('PATCH', '/api/v2/challenges/:id', ({ token, params, body }) => {
    const input = parse(challengePatchSchema, body);
    const a = account(token);
    const c = ownChallenge(a, params[0]);
    c.status = input.status;
    c.endedAt = stamp();
    return { challenge: challengeProgress(c, userToday(a)) };
  });

  on('PUT', '/api/v2/challenges/:id/logs/:date', ({ token, params, body }) => {
    const date = dayParam(params[1]);
    const input = parse(logInputSchema, body);
    const a = account(token);
    const c = ownChallenge(a, params[0]);
    const today = userToday(a);
    if (date < c.startedOn || date > addDays(c.startedOn, c.durationDays - 1) || date > addDays(today, 1)) fail(400, 'Ese día está fuera del reto');
    c.logs[date] = input.done;
    return { challenge: challengeProgress(c, today) };
  });

  // Panel y recomendaciones.
  on('GET', '/api/v2/dashboard', ({ token, query }) => {
    const a = account(token);
    const period = periodSchema.safeParse(query.get('period') ?? 'week');
    if (!period.success) fail(400, 'period debe ser day, week o month');
    const p = period.data as NonNullable<typeof period.data>;
    const today = userToday(a);
    const qDate = query.get('date');
    const date = isDay(qDate) ? qDate : today;
    const range = periodRange(p, date);
    const prev = previousRange(p, range);
    const scores = scoreDays(a, [...daysIn(prev), ...daysIn(range)], today);
    const cur = summarize(scores, range);
    const before = summarize(scores, prev);
    const pastDays = daysIn(range).filter((d) => d <= today);
    const scheduled = pastDays.flatMap((d) => habitsOn(a, d));
    const yearAgo = addDays(today, -365);
    const allDates = new Set(Object.keys(a.checkIns).filter((d) => d >= yearAgo && d <= today));
    return {
      period: p,
      date,
      today,
      range,
      previousRange: prev,
      overall: { score: cur.overall, previous: before.overall },
      pillars: PILLAR_IDS.map((id) => ({
        id,
        score: cur.scores[id],
        previous: before.scores[id],
        delta: cur.scores[id] !== null && before.scores[id] !== null ? (cur.scores[id] as number) - (before.scores[id] as number) : null,
        daysWithData: cur.daysWithData[id],
      })),
      series: daysIn(range).map((d) => {
        const s = scores.get(d) ?? null;
        return { date: d, overall: s ? overallScore(s) : null, pillars: s };
      }),
      habits: { scheduled: scheduled.length, done: scheduled.filter((h) => h.done).length },
      checkIns: { count: pastDays.filter((d) => !!a.checkIns[d]).length, streak: checkInStreak(allDates, today) },
      todayStatus: { checkIn: a.checkIns[today] ?? null, habits: habitsOn(a, today) },
      challenges: activeChallenges(a, today),
      recommendations: recommendationsFor(a, today),
      onboarded: !!a.profile?.onboardedAt,
    };
  });

  on('GET', '/api/v2/recommendations', ({ token }) => {
    const a = account(token);
    return { recommendations: recommendationsFor(a, userToday(a)) };
  });

  on('POST', '/api/v2/recommendations/:key/dismiss', ({ token, params }) => {
    const key = decodeURIComponent(params[0]);
    if (!/^[\w:-]{1,80}$/.test(key)) fail(400, 'Clave no válida');
    const a = account(token);
    const until = new Date(now().getTime() + 7 * 86_400_000).toISOString();
    a.dismissals[key] = until;
    return { ok: true, until };
  });

  // Cuenta.
  on('GET', '/api/v2/account/export', ({ token }) => {
    const a = account(token);
    const today = userToday(a);
    return {
      exportedAt: stamp(),
      user: publicUser(a),
      profile: publicProfile(a),
      checkIns: Object.values(a.checkIns).sort((x, y) => (x.date < y.date ? -1 : 1)),
      habits: a.habits.map((h) => ({ ...publicHabit(h), logs: logList(h.logs) })),
      challenges: a.challenges.map((c) => challengeProgress(c, today)),
      legacy: a.blob.data ?? {},
    };
  });

  on('DELETE', '/api/v2/account', ({ token, body }) => {
    const input = parse(accountDeleteSchema, body);
    void input;
    const a = account(token);
    const d = current();
    d.accounts = d.accounts.filter((x) => x !== a);
    for (const [t, id] of Object.entries(d.tokens)) if (id === a.user.id) delete d.tokens[t];
    return { ok: true };
  });

  // Avisos en el móvil: en la prueba no hay notificaciones.
  on('PUT', '/api/v2/devices', () => ({ ok: true }));
  on('DELETE', '/api/v2/devices/:token', () => ({ ok: true }));

  // Bóveda cifrada: el navegador cifra; aquí solo se valida la forma.
  on('PUT', '/api/v2/modules/vaultSecure', ({ token, body }) => {
    const vault = parse(vaultSecureSchema, body);
    const out = withDoc(account(token), (doc) => {
      if (vaultOf(doc)) fail(409, 'Ya tienes una bóveda');
      return { set: { vaultSecure: vault }, result: vault };
    });
    return created({ value: out.result, updatedAt: out.updatedAt });
  });

  on('DELETE', '/api/v2/modules/vaultSecure', ({ token }) => {
    const out = withDoc(account(token), () => ({ set: {}, unset: ['vaultSecure'], result: null }));
    return { ok: true, updatedAt: out.updatedAt };
  });

  on('POST', '/api/v2/modules/vaultSecure/items', ({ token, body }) => {
    const item = parse(vaultItemSchema, body.item) as Item;
    const out = editVault(account(token), (items) => {
      if (items.some((x) => idOf(x) === item.id)) fail(409, 'Ya existe un elemento con ese id');
      return { items: [...items, item], result: item };
    });
    return created({ item: out.result, updatedAt: out.updatedAt });
  });

  on('PUT', '/api/v2/modules/vaultSecure/items/:id', ({ token, params, body }) => {
    const patch = parse(vaultItemPatchSchema, body);
    const id = decodeURIComponent(params[0]);
    const out = editVault(account(token), (items) => {
      const i = items.findIndex((x) => idOf(x) === id);
      if (i < 0) fail(404, 'Elemento no encontrado');
      const next = [...items];
      next[i] = { id, ...patch };
      return { items: next, result: next[i] };
    });
    return { item: out.result, updatedAt: out.updatedAt };
  });

  on('DELETE', '/api/v2/modules/vaultSecure/items/:id', ({ token, params }) => {
    const id = decodeURIComponent(params[0]);
    const out = editVault(account(token), (items) => {
      if (!items.some((x) => idOf(x) === id)) fail(404, 'Elemento no encontrado');
      return { items: items.filter((x) => idOf(x) !== id), result: null };
    });
    return { ok: true, updatedAt: out.updatedAt };
  });

  on('POST', '/api/v2/modules/vaultSecure/migrate', ({ token, body }) => {
    const input = parse(vaultMigrateSchema, body);
    const out = editVault(account(token), (items, doc) => {
      const taken = new Set(items.map(idOf));
      if (input.items.some((x) => taken.has(x.id))) fail(409, 'Ya existe un elemento con ese id');
      const drop = new Set(input.legacyIds);
      const legacy = Array.isArray(doc.vault) ? (doc.vault as unknown[]) : [];
      const vault = legacy.filter((x) => !(typeof idOf(x) === 'string' && drop.has(idOf(x) as string)));
      return { items: [...items, ...(input.items as Item[])], result: { migrated: input.items.length, remaining: vault.length }, also: { vault } };
    });
    return { ...out.result, updatedAt: out.updatedAt };
  });

  // Módulos de la app anterior, elemento a elemento.
  const getDoc = ({ token }: Ctx) => {
    const a = account(token);
    return { data: a.blob.data ?? {}, updatedAt: a.blob.updatedAt };
  };
  on('GET', '/api/v2/modules', getDoc);

  const keyParam = (k: string): LegacyKey => (isLegacyKey(k) ? k : fail(404, 'Módulo no encontrado'));

  on('POST', '/api/v2/modules/:key', ({ token, params, body }) => {
    const key = keyParam(params[0]);
    const item = parse(legacyItemSchemas[key] as Schema<unknown>, body.item) as Item;
    const out = edit(account(token), key, (list, doc) => {
      if (list.some((x) => idOf(x) === item.id)) fail(409, 'Ya existe un elemento con ese id');
      checkUnique(key, item, list, item.id);
      checkRelations(key, item, doc);
      const max = LEGACY_NEWEST_FIRST[key];
      return { list: max ? [item, ...list].slice(0, max) : [...list, item], result: item };
    });
    return created({ item: out.result, updatedAt: out.updatedAt });
  });

  on('PUT', '/api/v2/modules/:key/order', ({ token, params, body }) => {
    const key = keyParam(params[0]);
    const input = parse(legacyReorderSchema, body);
    const out = edit(account(token), key, (list) => ({ list: reorderById(list, input.ids), result: null }));
    return { ok: true, updatedAt: out.updatedAt };
  });

  on('PATCH', '/api/v2/modules/:key/:id', ({ token, params, body }) => {
    const key = keyParam(params[0]);
    const id = decodeURIComponent(params[1]);
    const parsed = parse(legacyPatchSchemas[key] as Schema<Doc>, body);
    const patch = deriveLegacyPatch(key, parsed);
    const out = edit(account(token), key, (list, doc) => {
      const i = list.findIndex((x) => idOf(x) === id);
      if (i < 0) fail(404, 'Elemento no encontrado');
      const item = mergeLegacyItem(key, list[i], patch);
      const cross = LEGACY_CROSS[key];
      const msg = cross && cross.fields.some((f) => f in patch) ? cross.check(item) : null;
      if (msg) fail(400, `Datos inválidos: ${msg}`);
      checkUnique(key, patch, list, id);
      checkRelations(key, patch, doc);
      const next = [...list];
      next[i] = item;
      return { list: next, result: item };
    });
    return { item: out.result, updatedAt: out.updatedAt };
  });

  on('DELETE', '/api/v2/modules/:key/:id', ({ token, params }) => {
    const key = keyParam(params[0]);
    const id = decodeURIComponent(params[1]);
    const out = edit(account(token), key, (list, doc) => {
      if (!list.some((x) => idOf(x) === id)) fail(404, 'Elemento no encontrado');
      const child = LEGACY_CHILDREN[key];
      const also = child ? { [child.key]: rawList(doc, child.key).filter((s) => !s || s[child.field] !== id) } : undefined;
      return { list: list.filter((x) => idOf(x) !== id), result: null, also };
    });
    return { ok: true, updatedAt: out.updatedAt };
  });

  const saveObject = (partial: boolean) => ({ token, params, body }: Ctx) => {
    const key = params[0];
    if (!isLegacyObjectKey(key)) return fail(404, 'Módulo no encontrado');
    const input = parse((partial ? legacyObjectPatchSchemas[key] : legacyObjectSchemas[key]) as Schema<Doc>, body);
    const out = withDoc(account(token), (doc) => {
      const before = doc[key];
      const value = { ...legacyObjectDefaults(key), ...(isObj(before) ? before : {}), ...input };
      return { set: { [key]: value }, result: value };
    });
    return { value: out.result, updatedAt: out.updatedAt };
  };
  on('PUT', '/api/v2/modules/:key', saveObject(false));
  on('PATCH', '/api/v2/modules/:key', saveObject(true));

  // Sincronización v1 (el documento entero).
  on('GET', '/api/sync', getDoc);
  on('PUT', '/api/sync', ({ token, body }) => {
    const a = account(token);
    if (!isObj(body.data)) fail(400, 'data debe ser un objeto');
    if (body.baseUpdatedAt != null && body.baseUpdatedAt !== a.blob.updatedAt) {
      fail(409, 'Tus datos cambiaron en otro dispositivo. Recarga para combinarlos antes de guardar.', { data: a.blob.data, updatedAt: a.blob.updatedAt });
    }
    a.blob = { data: body.data as Doc, updatedAt: stamp() };
    return { ok: true, updatedAt: a.blob.updatedAt };
  });

  // Imágenes de los apuntes.
  on('GET', '/api/images', ({ token }) => ({ ids: Object.keys(account(token).images) }));
  on('POST', '/api/images', ({ token, body }) => {
    const a = account(token);
    if (!isObj(body.images)) fail(400, 'images debe ser un objeto');
    let count = 0;
    for (const [id, data] of Object.entries(body.images as Doc).slice(0, 50)) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || typeof data !== 'string' || !data.startsWith('data:') || data.length > 4 * 1024 * 1024) continue;
      a.images[id] = data;
      count++;
    }
    return { ok: true, count };
  });
  on('POST', '/api/images/fetch', ({ token, body }) => {
    const a = account(token);
    const wanted: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown): x is string => typeof x === 'string').slice(0, 100) : [];
    return { images: Object.fromEntries(wanted.filter((id) => a.images[id]).map((id) => [id, a.images[id]])) };
  });

  // Pareja: en la prueba, cualquier código válido vincula con una pareja de ejemplo.
  const partnerView = (a: DemoAccount): PartnerView => {
    if (!a.partner) return { partner: null };
    const habits = [
      { label: 'Beber 8 vasos de agua', done: true, streak: 6 },
      { label: 'Caminar 30 minutos', done: false, streak: 2 },
      { label: 'Leer 20 páginas', done: true, streak: 11 },
    ];
    return { partner: a.partner, habits, doneToday: habits.filter((h) => h.done).length, total: habits.length };
  };
  const ensureCode = (a: DemoAccount) => {
    if (!a.inviteCode) a.inviteCode = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    return a.inviteCode;
  };
  on('GET', '/api/partner', ({ token }) => partnerView(account(token)));
  on('POST', '/api/partner/invite', ({ token }) => {
    const a = account(token);
    if (a.partner) fail(409, 'Ya tienes una pareja vinculada. Desvincúlala primero.');
    return { code: ensureCode(a) };
  });
  on('POST', '/api/partner/invite/email', ({ token, body }) => {
    const email = String(body.email ?? '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Correo no válido');
    const a = account(token);
    if (a.partner) fail(409, 'Ya tienes una pareja vinculada.');
    // La prueba no envía correos.
    return { ok: true, code: ensureCode(a), sent: false };
  });
  on('POST', '/api/partner/accept', ({ token, body }) => {
    const code = String(body.code ?? '').toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) fail(400, 'Código inválido');
    const a = account(token);
    if (a.partner) fail(409, 'Ya tienes una pareja vinculada. Desvincúlala primero.');
    if (code === a.inviteCode) fail(400, 'Ese es tu propio código');
    a.partner = { name: 'Marta' };
    a.inviteCode = null;
    return { ok: true, partner: a.partner };
  });
  on('DELETE', '/api/partner', ({ token }) => {
    account(token).partner = null;
    return { ok: true };
  });

  /** Atiende una petición y devuelve [estado, cuerpo]. */
  function handle(method: string, path: string, query: URLSearchParams, body: unknown, token: string | null): Result {
    const matches = routes.map((r) => ({ r, m: path.match(r.re) })).filter((x) => x.m);
    if (!matches.length) return [404, { error: 'Ruta no encontrada' }];
    const hit = matches.find((x) => x.r.method === method);
    if (!hit) return [404, { error: 'Ruta no encontrada' }];
    try {
      if (!hit.r.open) account(token);
      const out = hit.r.handler({ body: isObj(body) ? body : {}, query, params: (hit.m as RegExpMatchArray).slice(1), token });
      persist();
      return Array.isArray(out) && out.length === 2 && typeof out[0] === 'number' ? (out as Result) : [200, out];
    } catch (e) {
      if (e instanceof HttpError) {
        persist();
        return [e.status, { error: e.message, ...e.extra }];
      }
      console.error('[prueba] error en la API falsa', e);
      return [500, { error: 'Error interno' }];
    }
  }

  /** `fetch` para @dyc/api-client: solo responde a /api/…; lo demás falla como sin conexión. */
  async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://prueba.local');
    if (!url.pathname.startsWith('/api/')) throw new TypeError('La versión de prueba no se conecta a ningún servidor.');
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    } catch {
      return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const auth = new Headers(init?.headers).get('Authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    // Se guarda en seguida y se responde tras la espera: recargar a media petición no pierde el cambio.
    const [status, data] = handle(method, url.pathname, url.searchParams, body, token);
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  }

  return {
    fetch: demoFetch,
    handle,
    /** Base de datos actual (pruebas). */
    db: current,
    /**
     * Token con el que arranca la app: el guardado si sigue valiendo; si la
     * base de datos se acaba de crear, el de la cuenta de ejemplo (la prueba
     * empieza con la sesión abierta).
     */
    bootToken(stored: string | null): string | null {
      const d = current();
      if (stored && d.tokens[stored]) return stored;
      return fresh && d.tokens[SAMPLE_TOKEN] ? SAMPLE_TOKEN : null;
    },
    /** Borra los datos de este navegador; la próxima carga vuelve a sembrar la cuenta de ejemplo. */
    reset() {
      storage.set(DB_KEY, null);
      db = null;
    },
  };
}

export type DemoServer = ReturnType<typeof createDemoServer>;

let shared: DemoServer | null = null;

/** El servidor de la página (uno solo, con espera artificial de ~120 ms). */
export function demoServer(): DemoServer {
  shared ??= createDemoServer({ latency: 120 });
  return shared;
}


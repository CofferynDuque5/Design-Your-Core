import { COURSE_LESSONS_MAX, hhmmToHours, legacyList, type CourseLesson, type LegacyClass, type LegacyCourse, type LegacyData } from './legacy.js';
import { courseProgress, youtubeRef } from './tools.js';

// ---------- Duración de un curso a partir de su enlace ----------

/**
 * Qué página hay que leer para saber cuánto dura un curso. YouTube se lee de
 * su página; Coursera y Udemy, de su API pública (más estable que la página);
 * cualquier otra página, tal cual.
 */
export type LengthSource =
  | { kind: 'youtube-video'; fetch: string }
  | { kind: 'youtube-list'; fetch: string }
  | { kind: 'coursera'; fetch: string }
  | { kind: 'udemy'; fetch: string }
  | { kind: 'page'; fetch: string };

export function courseLengthSource(url: string): LengthSource | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const yt = youtubeRef(url);
  if (yt?.list) return { kind: 'youtube-list', fetch: `https://www.youtube.com/playlist?list=${yt.list}&hl=es` };
  if (yt?.video) return { kind: 'youtube-video', fetch: `https://www.youtube.com/watch?v=${yt.video}&hl=es` };
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host.endsWith('coursera.org') && ['learn', 'specializations', 'professional-certificates'].includes(parts[0] ?? '') && /^[\w-]{2,120}$/.test(parts[1] ?? '')) {
    if (parts[0] === 'learn') return { kind: 'coursera', fetch: `https://api.coursera.org/api/courses.v1?q=slug&slug=${parts[1]}&fields=workload` };
  }
  if (host.endsWith('udemy.com') && parts[0] === 'course' && /^[\w-]{2,200}$/.test(parts[1] ?? '')) {
    return { kind: 'udemy', fetch: `https://www.udemy.com/api-2.0/courses/${parts[1]}/?fields[course]=content_info,estimated_content_length` };
  }
  return { kind: 'page', fetch: u.toString() };
}

export interface CourseLength {
  /** Segundos en total. */
  seconds: number;
  /** false si es una cifra que da la página («unas 20 horas») o se calculó con una parte. */
  exact: boolean;
  /** Videos de una lista de YouTube. */
  videos?: number;
  /** Canal o academia, si la página lo dice (YouTube). */
  author?: string;
  /** Nombre del video o de la lista, si la página lo dice (YouTube). */
  title?: string;
  /** Videos de una lista de YouTube, en orden (sirven de lecciones). */
  items?: Array<{ video: string; title: string; seconds: number }>;
}

/** Lecciones a partir de los videos de una lista de YouTube. */
export function lessonsFromPlaylist(items: NonNullable<CourseLength['items']>, list: string, newId: () => string): CourseLesson[] {
  return items.slice(0, COURSE_LESSONS_MAX).map((v, i) => ({
    id: newId(),
    title: (v.title.trim() || `Video ${i + 1}`).slice(0, 200),
    url: `https://www.youtube.com/watch?v=${v.video}&list=${list}`,
    ...(v.seconds > 0 ? { seconds: Math.min(1e6, Math.round(v.seconds)) } : {}),
  }));
}

/** Texto de una cadena JSON tal como viene en la página («Caf\u00e9» → «Café»). */
function jsonText(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const v = (JSON.parse(`"${raw}"`) as string).trim();
    return v ? v.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

/** Contenido de una etiqueta <meta> («&amp;» → «&»). */
function metaText(body: string, name: string): string | undefined {
  const m = new RegExp(`<meta\\s+(?:name|property)="${name}"\\s+content="([^"]*)"`, 'i').exec(body);
  if (!m) return undefined;
  const v = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  return v ? v.slice(0, 200) : undefined;
}

/** Canal y nombre que trae la página de YouTube (si los trae). */
function youtubeInfo(body: string, list: boolean): Pick<CourseLength, 'author' | 'title'> {
  const author = list
    ? jsonText(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(body)?.[1]) ?? jsonText(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/.exec(body)?.[1])
    : jsonText(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/.exec(body)?.[1]) ?? jsonText(/"videoDetails":\{[^}]*?"author":"((?:[^"\\]|\\.)*)"/.exec(body)?.[1]) ?? metaText(body, 'author');
  const title = metaText(body, 'og:title') ?? metaText(body, 'title');
  return { ...(author ? { author } : {}), ...(title ? { title } : {}) };
}

/** «PT1H2M3S» → 3723. */
export function parseIsoDuration(v: string): number | null {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(v.trim());
  if (!m || v.trim().toUpperCase() === 'P' || v.trim().toUpperCase() === 'PT') return null;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  const total = Math.round(d * 86400 + h * 3600 + mi * 60 + s);
  return total > 0 ? total : null;
}

const num = (v: string) => Number(v.replace(',', '.'));

/**
 * Horas en un texto como «Aproximadamente 61 horas», «62.5 total hours»,
 * «4-6 hours/week» (con «3 weeks»)… Si da un rango, toma el punto medio.
 */
export function hoursFromText(text: string): number | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  const range = String.raw`(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|a|to)\s*(\d+(?:[.,]\d+)?))?`;
  const per = new RegExp(`${range}\\s*(?:h|hrs?|hours?|horas?)\\s*(?:/|a la|por|per|each|cada)\\s*(?:semana|week)`).exec(t);
  if (per) {
    const weekly = per[2] ? (num(per[1]) + num(per[2])) / 2 : num(per[1]);
    const weeks = /(\d+)\s*(?:semanas|weeks)/.exec(t.replace(per[0], ''));
    return weeks ? weekly * Number(weeks[1]) : null;
  }
  const hm = /(\d+)\s*(?:h|hrs?|hours?|horas?)\s*(?:y\s*|and\s*)?(\d+)\s*(?:m|min|mins|minutos|minutes)\b/.exec(t);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  const h = new RegExp(`${range}\\s*(?:total\\s*)?(?:h|hrs?|hours?|horas?)\\b`).exec(t);
  if (h) return h[2] ? (num(h[1]) + num(h[2])) / 2 : num(h[1]);
  const m = /(\d+)\s*(?:min|mins|minutos|minutes)\b/.exec(t);
  return m ? Number(m[1]) / 60 : null;
}

const fromHours = (h: number | null, exact = false): CourseLength | null => (h && h > 0 && h < 2000 ? { seconds: Math.round(h * 3600), exact } : null);

/** Lee la duración de lo que devolvió la página o la API. `null` si no la dice. */
export function parseCourseLength(kind: LengthSource['kind'], body: string): CourseLength | null {
  if (kind === 'youtube-video') {
    const s = /"lengthSeconds":"(\d+)"/.exec(body) ?? /"approxDurationMs":"(\d+)"/.exec(body);
    if (s) return { seconds: s[0].includes('Ms') ? Math.round(Number(s[1]) / 1000) : Number(s[1]), exact: true, ...youtubeInfo(body, false) };
    const iso = /itemprop="duration"\s+content="([^"]+)"/.exec(body);
    const v = iso && parseIsoDuration(iso[1]);
    return v ? { seconds: v, exact: true, ...youtubeInfo(body, false) } : null;
  }
  if (kind === 'youtube-list') {
    // Cada video de la lista trae su id y su duración; la página muestra hasta 100.
    const seen = new Map<string, number>();
    const re = /"playlistVideoRenderer":\{"videoId":"([\w-]{11})"[\s\S]*?"lengthSeconds":"(\d+)"/g;
    for (let m = re.exec(body); m; m = re.exec(body)) if (!seen.has(m[1])) seen.set(m[1], Number(m[2]));
    if (!seen.size) return null;
    const total = [...seen.values()].reduce((a, b) => a + b, 0);
    const count = /"numVideosText":\{"runs":\[\{"text":"([\d.,]+)"/.exec(body) ?? /"stats":\[\{"runs":\[\{"text":"([\d.,]+)"/.exec(body);
    const n = count ? Number(count[1].replace(/[.,]/g, '')) : seen.size;
    const info = youtubeInfo(body, true);
    if (n > seen.size) return { seconds: Math.round((total / seen.size) * n), exact: false, videos: n, ...info };
    return { seconds: total, exact: true, videos: seen.size, ...info };
  }
  if (kind === 'coursera') {
    try {
      const w = (JSON.parse(body) as { elements?: Array<{ workload?: string }> }).elements?.[0]?.workload;
      return w ? fromHours(hoursFromText(w)) : null;
    } catch {
      return null;
    }
  }
  if (kind === 'udemy') {
    try {
      const j = JSON.parse(body) as { estimated_content_length?: number; content_info?: string };
      if (typeof j.estimated_content_length === 'number' && j.estimated_content_length > 0) return { seconds: Math.round(j.estimated_content_length * 60), exact: true };
      return j.content_info ? fromHours(hoursFromText(j.content_info)) : null;
    } catch {
      // Si en vez de la API llegó la página, se busca como en cualquier otra.
    }
  }
  // Cualquier página: datos estructurados primero, después el texto.
  const iso = /"(?:timeRequired|duration)"\s*:\s*"(P[^"]+)"/.exec(body) ?? /itemprop="(?:timeRequired|duration)"\s+content="(P[^"]+)"/.exec(body);
  const v = iso && parseIsoDuration(iso[1]);
  if (v) return { seconds: v, exact: false };
  const text = body
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ');
  const phrase =
    /(\d+(?:[.,]\d+)?)\s*(?:horas?|hours?)\s*(?:de\s*(?:contenido|video|curso)|en total|totales|total|of\s*(?:content|video)|on-demand video|to complete|para completar)/i.exec(text) ??
    /(?:duraci[oó]n|duration)\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:horas?|hours?|h)\b/i.exec(text);
  return phrase ? fromHours(num(phrase[1])) : null;
}

/** 5400 → «1 h 30 min», 2700 → «45 min». */
export function formatLength(seconds: number): string {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${Math.max(1, m)} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Duración de un curso en segundos, de una sola fuente: si es un solo video y
 * ya se reprodujo, la del reproductor (exacta); si no, la guardada.
 */
export function courseSeconds(c: Pick<LegacyCourse, 'url' | 'length' | 'duration' | 'lengthFrom'>): { seconds: number; exact: boolean } | null {
  const single = !!c.url && !/[?&]list=/.test(c.url);
  if (single && c.duration && c.duration > 0) return { seconds: c.duration, exact: true };
  if (c.length && c.length > 0) return { seconds: c.length, exact: c.lengthFrom !== 'aprox' };
  return null;
}

/** «4 h 14 min» o «unas 12 h»; vacío si no se sabe. */
export function courseLengthLabel(c: Pick<LegacyCourse, 'url' | 'length' | 'duration' | 'lengthFrom'>): string {
  const l = courseSeconds(c);
  return l ? `${l.exact ? '' : 'unas '}${formatLength(l.seconds)}` : '';
}

/** Lo que falta por ver, en segundos (null si no se sabe cuánto dura). */
export function courseRemaining(c: LegacyCourse): number | null {
  if (c.status === 'hecho') return 0;
  const l = courseSeconds(c);
  if (!l) return null;
  return Math.round(l.seconds * (1 - courseProgress(c) / 100));
}

// ---------- Orden de los cursos de un tema (sin que la persona decida) ----------

export type CourseLevel = 'previo' | 'basico' | 'intermedio' | 'avanzado';
export const COURSE_LEVEL_LABEL: Record<CourseLevel, string> = { previo: 'Antes de empezar', basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' };

const norm = (t: string) =>
  ` ${t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9#+.]+/g, ' ')} `;
const has = (text: string, words: string[]) => words.some((w) => text.includes(` ${w} `));

// Palabras que dicen el nivel del curso…
const LEVEL_WORDS: Array<[number, string[]]> = [
  [1, ['basico', 'basicos', 'principiante', 'principiantes', 'desde cero', 'de cero', 'from scratch', 'intro', 'introduccion', 'introduction', 'fundamentos', 'fundamentals', 'primeros pasos', 'beginner', 'beginners', 'basics', 'getting started', '101', 'crash course', 'nivel 1', 'level 1', 'para empezar']],
  [2, ['intermedio', 'intermedia', 'intermediate', 'nivel 2', 'level 2']],
  [3, ['avanzado', 'avanzada', 'avanzados', 'advanced', 'experto', 'expert', 'master', 'masterclass', 'senior', 'nivel 3', 'level 3', 'profundidad', 'in depth', 'deep dive', 'a fondo']],
];
// …y temas que suelen ir antes o después (programación y web, lo más común).
const STAGE_WORDS: Array<[number, string[]]> = [
  [0.5, ['javascript para', 'js para', 'js moderno', 'javascript moderno', 'es6', 'html', 'css', 'logica de programacion', 'git']],
  [1.5, ['componentes', 'components', 'props', 'jsx', 'hooks', 'usestate', 'useeffect', 'estado', 'state', 'eventos', 'router', 'rutas', 'routing', 'curso completo', 'complete', 'bootcamp', 'zero to hero', 'guia completa', 'gramatica', 'vocabulario']],
  [2, ['context', 'redux', 'zustand', 'react query', 'tanstack', 'formularios', 'forms', 'api', 'apis', 'fetch', 'firebase', 'proyecto', 'proyectos', 'project', 'projects', 'practico', 'practica', 'clon', 'clone', 'tailwind', 'styled', 'conversacion']],
  [2.5, ['typescript', 'testing', 'tests', 'jest', 'vitest', 'testing library', 'next', 'next.js', 'nextjs', 'remix', 'ssr', 'server components', 'react native', 'animaciones', 'animations', 'framer', 'graphql', 'docker', 'deploy', 'despliegue']],
  [3, ['patrones', 'patterns', 'arquitectura', 'architecture', 'performance', 'rendimiento', 'optimizacion', 'optimization', 'internals', 'microfrontends', 'escalables', 'scalable']],
];

/** Nivel estimado de un curso con su nombre, notas y enlace (1 = empezar, 3 = al final). */
export function courseLevel(c: Pick<LegacyCourse, 'title' | 'notes' | 'url'>): { score: number; level: CourseLevel; part: number } {
  let path = '';
  try {
    path = decodeURIComponent(new URL(c.url).pathname).replace(/[-_/]+/g, ' ');
  } catch {
    /* sin enlace */
  }
  const text = norm(`${c.title} ${path} ${c.notes.split('\n')[0] ?? ''}`);
  const explicit = LEVEL_WORDS.find(([, w]) => has(text, w))?.[0];
  const stages = STAGE_WORDS.filter(([, w]) => has(text, w)).map(([v]) => v);
  const stage = stages.length ? Math.max(...stages) : undefined;
  // «Next.js desde cero» va después de los básicos de React; «Redux avanzado», casi al final.
  const score = explicit !== undefined && stage !== undefined ? (explicit < stage ? stage * 0.7 + explicit * 0.3 : explicit * 0.7 + stage * 0.3) : (explicit ?? stage ?? 2);
  const part = /\b(?:parte|part|nivel|level|modulo|module|vol|volumen|capitulo|chapter|#)\s*(\d{1,3})\b/.exec(text);
  const level: CourseLevel = score < 1 ? 'previo' : score < 1.75 ? 'basico' : score < 2.6 ? 'intermedio' : 'avanzado';
  return { score, level, part: part ? Number(part[1]) : 0 };
}

/**
 * Ruta sugerida de un tema: primero lo que ya empezaste, después de lo más
 * básico a lo más avanzado (las partes en orden, y a igual nivel el más corto),
 * y al final lo terminado. No hace falta que la persona ordene nada.
 */
export function courseRoute<T extends LegacyCourse>(items: T[]): T[] {
  const rank = (c: T) => (c.status === 'hecho' ? 2 : c.status === 'curso' ? 0 : 1);
  const info = new Map(items.map((c, i) => [c.id, { i, ...courseLevel(c) }]));
  const len = (c: T) => (c.length ? c.length : 1e9);
  return [...items].sort((a, b) => {
    const A = info.get(a.id)!;
    const B = info.get(b.id)!;
    return rank(a) - rank(b) || (rank(a) === 0 ? courseProgress(b) - courseProgress(a) : 0) || A.score - B.score || A.part - B.part || len(a) - len(b) || A.i - B.i;
  });
}

/** El curso que sigue en un tema (el primero de la ruta sin terminar). */
export const nextInTopic = (courses: LegacyCourse[], topic: string, except?: string): LegacyCourse | undefined =>
  courseRoute(courses.filter((c) => sameTopic(c.topic, topic) && c.id !== except)).find((c) => c.status !== 'hecho');

const sameTopic = (a: string, b: string) => (a.trim() || 'Sin tema').toLocaleLowerCase('es') === (b.trim() || 'Sin tema').toLocaleLowerCase('es');

/**
 * Al terminar un curso, sus clases del Horario pasan al siguiente del mismo
 * tema. Devuelve los cambios de cada clase (vacío si no hay siguiente).
 */
export function handoffClasses(data: LegacyData | null | undefined, finishedId: string): { next: LegacyCourse | null; patches: Array<{ id: string; patch: Partial<LegacyClass> }> } {
  const courses = legacyList(data, 'courses');
  const done = courses.find((c) => c.id === finishedId);
  const classes = legacyList(data, 'classes').filter((k) => k.course === finishedId);
  if (!done || !classes.length) return { next: null, patches: [] };
  const next = nextInTopic(courses, done.topic, finishedId);
  if (!next) return { next: null, patches: [] };
  const title = (next.title.trim() || done.topic).slice(0, 120);
  return { next, patches: classes.map((k) => ({ id: k.id, patch: { course: next.id, title } })) };
}

// ---------- Horario automático ----------

export interface StudyPrefs {
  /** Días disponibles, «135» = lunes, miércoles y viernes (1 = lunes). */
  days: string;
  /** Ventana del día, «HH:MM». */
  from: string;
  to: string;
  /** Minutos por sesión. */
  session: number;
  /** Horas de estudio a la semana. */
  weekly: number;
  /** Sesiones mínimas a la semana aunque pasen de `weekly` (una por tema). */
  atLeast?: number;
}

export interface StudySession {
  courseId: string;
  day: number;
  start: string;
  end: string;
}

export interface StudyPlan {
  sessions: StudySession[];
  /** Por curso: sesiones a la semana y, si se sabe cuánto falta, semanas y fecha estimada. */
  courses: Array<{ courseId: string; perWeek: number; weeks: number | null; finish: string | null }>;
  /** Horas que caben a la semana en los huecos libres (puede ser menos que lo pedido). */
  fits: number;
}

export const STUDY_SESSIONS = [30, 45, 60, 90] as const;
export const STUDY_WEEKLY = [2, 3, 5, 7, 10, 14] as const;

const toMin = (t: string) => Math.round(hhmmToHours(t) * 60);
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Reparte el estudio de los cursos elegidos en los huecos libres de la semana.
 * - Solo usa los días y la ventana elegidos y no pisa otras clases (las
 *   clases que ya tenían estos cursos se reemplazan, así que no cuentan).
 * - Primero una sesión por día, después la segunda… para no cargar un día.
 * - Cada curso recibe sesiones según lo que le falta (los que no tienen
 *   duración cuentan como el promedio), al menos una si hay para todos.
 */
export function planStudy(
  data: LegacyData | null | undefined,
  courseIds: string[],
  prefs: StudyPrefs,
  now = new Date(),
  /** Lo que falta de cada curso; por defecto, su duración menos lo visto. */
  remaining: (c: LegacyCourse) => number | null = courseRemaining,
): StudyPlan {
  const all = legacyList(data, 'courses');
  const chosen = courseIds.map((id) => all.find((c) => c.id === id)).filter((c): c is LegacyCourse => !!c && c.status !== 'hecho');
  const empty: StudyPlan = { sessions: [], courses: chosen.map((c) => ({ courseId: c.id, perWeek: 0, weeks: null, finish: null })), fits: 0 };
  const session = Math.max(15, Math.min(240, Math.round(prefs.session)));
  const from = toMin(prefs.from);
  const to = toMin(prefs.to);
  const days = [...new Set(prefs.days.split('').map(Number))].filter((d) => d >= 1 && d <= 7).sort();
  if (!chosen.length || !days.length || !(to - from >= session)) return empty;

  // Huecos libres por día dentro de la ventana.
  const ids = new Set(chosen.map((c) => c.id));
  const busy = legacyList(data, 'classes').filter((k: LegacyClass) => !(k.course && ids.has(k.course)));
  const slots: StudySession[][] = days.map((day) => {
    const taken = busy
      .filter((k) => Number(k.day) === day)
      .map((k) => [toMin(k.start), toMin(k.end)] as const)
      .sort((a, b) => a[0] - b[0]);
    const out: StudySession[] = [];
    let t = from;
    while (t + session <= to) {
      const clash = taken.find(([s, e]) => s < t + session && e > t);
      if (clash) {
        t = Math.max(t + 5, clash[1]);
        continue;
      }
      out.push({ courseId: '', day, start: toHHMM(t), end: toHHMM(t + session) });
      t += session;
    }
    return out;
  });
  // Una por día, luego la segunda de cada día…
  const order: StudySession[] = [];
  for (let round = 0; slots.some((s) => s.length > round); round++) for (const s of slots) if (s[round]) order.push(s[round]);
  const wanted = Math.max(1, Math.round((prefs.weekly * 60) / session), Math.min(chosen.length, Math.floor(prefs.atLeast ?? 0)));
  const picked = order.slice(0, wanted);
  const fits = Math.round(((order.length * session) / 60) * 10) / 10;
  if (!picked.length) return { ...empty, fits };

  // Cuántas sesiones le tocan a cada curso (mayores restos), según lo que falta.
  const rem = chosen.map((c) => remaining(c));
  const known = rem.filter((r): r is number => r !== null && r > 0);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const weight = rem.map((r) => (r === null ? avg : Math.max(r, 1)));
  const sum = weight.reduce((a, b) => a + b, 0);
  const n = picked.length;
  let share = weight.map((w) => (w / sum) * n);
  if (n >= chosen.length) share = share.map((x) => Math.max(1, x));
  const base = share.map(Math.floor);
  let left = n - base.reduce((a, b) => a + b, 0);
  const byRest = share.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of byRest) if (left > 0) (base[i]++, left--);
  // Si «al menos una» pasó del total, se quita a los que más tienen.
  while (base.reduce((a, b) => a + b, 0) > n) base[base.indexOf(Math.max(...base))]--;

  // Se alternan los cursos para que no caigan todos seguidos el mismo día.
  const queue: string[] = [];
  const counts = [...base];
  while (counts.some((x) => x > 0)) chosen.forEach((c, i) => counts[i] > 0 && (queue.push(c.id), counts[i]--));
  const sessions = picked
    .map((s, i) => ({ ...s, courseId: queue[i] }))
    .filter((s) => s.courseId)
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));

  const courses = chosen.map((c, i) => {
    const perWeek = base[i];
    const r = rem[i];
    if (r === null || !perWeek) return { courseId: c.id, perWeek, weeks: null, finish: null };
    const weeks = Math.max(1, Math.ceil(r / (perWeek * session * 60)));
    const end = new Date(now);
    end.setDate(end.getDate() + weeks * 7);
    return { courseId: c.id, perWeek, weeks, finish: end.toISOString().slice(0, 10) };
  });
  return { sessions, courses, fits };
}

export interface TopicPlan {
  topic: string;
  /** El curso con el que se empieza (el primero de la ruta). */
  courseId: string;
  /** Cursos sin terminar del tema y cuántos no tienen duración. */
  count: number;
  unknown: number;
  perWeek: number;
  /** Para todo el tema, con los cursos que tienen duración. */
  weeks: number | null;
  finish: string | null;
}

/**
 * Horario por temas: cada tema estudia un curso a la vez, en el orden de su
 * ruta. Las horas se reparten según lo que falta de todo el tema, y al
 * terminar un curso sus clases pasan al siguiente (`handoffClasses`).
 */
export function planTopics(data: LegacyData | null | undefined, topics: string[], prefs: StudyPrefs, now = new Date()): StudyPlan & { topics: TopicPlan[] } {
  const all = legacyList(data, 'courses');
  const groups = topics
    .map((topic) => {
      const open = courseRoute(all.filter((c) => sameTopic(c.topic, topic))).filter((c) => c.status !== 'hecho');
      return { topic, open, lead: open[0] };
    })
    .filter((g) => g.lead);
  const totals = new Map(
    groups.map((g) => {
      const known = g.open.map(courseRemaining).filter((r): r is number => r !== null);
      return [g.lead.id, { sum: known.length ? known.reduce((a, b) => a + b, 0) : null, unknown: g.open.length - known.length }];
    }),
  );
  // Cada tema recibe al menos una sesión si caben, aunque pase de las horas pedidas.
  const plan = planStudy(data, groups.map((g) => g.lead.id), { ...prefs, atLeast: groups.length }, now, (c) => totals.get(c.id)?.sum ?? courseRemaining(c));
  const session = Math.max(15, Math.min(240, Math.round(prefs.session)));
  const byId = new Map(plan.courses.map((c) => [c.courseId, c]));
  return {
    ...plan,
    topics: groups.map((g) => {
      const t = totals.get(g.lead.id)!;
      const perWeek = byId.get(g.lead.id)?.perWeek ?? 0;
      const weeks = t.sum !== null && perWeek ? Math.max(1, Math.ceil(t.sum / (perWeek * session * 60))) : null;
      const end = new Date(now);
      if (weeks) end.setDate(end.getDate() + weeks * 7);
      return { topic: g.topic, courseId: g.lead.id, count: g.open.length, unknown: t.unknown, perWeek, weeks, finish: weeks ? end.toISOString().slice(0, 10) : null };
    }),
  };
}

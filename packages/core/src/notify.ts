import { legacyList, type LegacyData } from './legacy.js';
import { courseName, showableClasses } from './tools.js';

/**
 * Avisos del teléfono para las herramientas: clases del Horario (también los
 * cursos que se agregaron al horario), recordatorios del Calendario, tareas
 * de la Agenda con aviso, rutinas y cuidados de mascotas. Son notificaciones locales: el teléfono las muestra
 * a su hora aunque la app esté cerrada y sin pasar por el servidor.
 */

export interface NotifyPrefs {
  /** Interruptor general. */
  enabled: boolean;
  classes: boolean;
  /** Minutos de antelación para las clases y cursos. */
  classLead: number;
  reminders: boolean;
  tasks: boolean;
  /** Rutinas y cuidados de mascotas con hora y días. */
  routines: boolean;
}

export const DEFAULT_NOTIFY: NotifyPrefs = { enabled: false, classes: true, classLead: 10, reminders: true, tasks: true, routines: true };
export const CLASS_LEADS = [0, 5, 10, 15, 30] as const;
/** iOS guarda como mucho 64 avisos programados; dejamos sitio al del check-in. */
export const NOTIFY_MAX = 60;

export type NotifyTrigger =
  | { kind: 'weekly'; /** 1 = lunes … 7 = domingo */ weekday: number; hour: number; minute: number }
  | { kind: 'monthly'; day: number; hour: number; minute: number }
  | { kind: 'date'; at: string };

export interface PlannedNotification {
  id: string;
  title: string;
  body: string;
  /** Pantalla que se abre al tocarla. */
  url: string;
  trigger: NotifyTrigger;
}

export function parseNotifyPrefs(v: unknown): NotifyPrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof NotifyPrefs, unknown>>;
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  return {
    enabled: bool(o.enabled, DEFAULT_NOTIFY.enabled),
    classes: bool(o.classes, DEFAULT_NOTIFY.classes),
    classLead: (CLASS_LEADS as readonly number[]).includes(o.classLead as number) ? (o.classLead as number) : DEFAULT_NOTIFY.classLead,
    reminders: bool(o.reminders, DEFAULT_NOTIFY.reminders),
    tasks: bool(o.tasks, DEFAULT_NOTIFY.tasks),
    routines: bool(o.routines, DEFAULT_NOTIFY.routines),
  };
}

/** «14:00», «2:30 pm», «9h» → { hour, minute }; si no hay hora, null. */
export function parseLooseTime(v: string): { hour: number; minute: number } | null {
  const m = /(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i.exec(v ?? '');
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const ampm = m[3]?.toLowerCase().replace(/[.\s]/g, '');
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (!m[2] && !ampm && !/h/i.test(v)) return null;
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

const leadText = (min: number) => (min === 0 ? 'ahora' : `en ${min} min`);

export function notificationPlan(data: LegacyData | null | undefined, prefs: NotifyPrefs, now: Date = new Date()): PlannedNotification[] {
  if (!prefs.enabled) return [];
  const out: PlannedNotification[] = [];

  if (prefs.tasks) {
    for (const t of legacyList(data, 'tasks')) {
      if (!t.rem || t.done || !t.time) continue;
      const [h, m] = t.time.split(':').map(Number);
      const at = new Date(now);
      at.setHours(h, m, 0, 0);
      if (at.getTime() <= now.getTime()) continue;
      out.push({ id: `task-${t.id}`, title: `Tarea: ${t.title}`, body: `A las ${t.time}. Tócala para verla en tu Agenda.`, url: '/agenda?vista=tareas', trigger: { kind: 'date', at: at.toISOString() } });
    }
  }

  if (prefs.classes) {
    const courses = new Map(legacyList(data, 'courses').map((c) => [c.id, c]));
    for (const k of showableClasses(legacyList(data, 'classes'))) {
      const [h, m] = k.start.split(':').map(Number);
      let total = (k.day - 1) * 1440 + h * 60 + m - prefs.classLead;
      total = (total + 7 * 1440) % (7 * 1440);
      const trigger: NotifyTrigger = { kind: 'weekly', weekday: Math.floor(total / 1440) + 1, hour: Math.floor((total % 1440) / 60), minute: total % 60 };
      const course = k.course ? courses.get(k.course) : undefined;
      if (course && course.status !== 'hecho')
        out.push({ id: `class-${k.id}`, title: `Curso ${leadText(prefs.classLead)}: ${courseName(course)}`, body: 'Toca para continuar donde lo dejaste.', url: `/cursos?abrir=${encodeURIComponent(course.id)}`, trigger });
      else if (!k.course)
        out.push({ id: `class-${k.id}`, title: `${k.title} ${leadText(prefs.classLead)}`, body: [`De ${k.start} a ${k.end}`, k.room].filter(Boolean).join(' · '), url: '/horario', trigger });
    }
  }

  if (prefs.reminders) {
    for (const r of legacyList(data, 'reminders')) {
      if (r.on === false || !Number.isInteger(r.day) || r.day < 1 || r.day > 31) continue;
      const time = parseLooseTime(r.when) ?? { hour: 9, minute: 0 };
      out.push({ id: `rem-${r.id}`, title: r.title, body: r.when ? `Hoy, ${r.when}` : 'Recordatorio de hoy', url: '/calendario', trigger: { kind: 'monthly', day: r.day, ...time } });
    }
  }

  if (prefs.routines) {
    const weekly = (id: string, title: string, body: string, url: string, time: string, days: string) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
      if (!m) return;
      const hour = Number(m[1]);
      const minute = Number(m[2]);
      if (hour > 23 || minute > 59) return;
      for (const d of new Set((days || '1234567').split('').map(Number)))
        if (d >= 1 && d <= 7) out.push({ id: `${id}-${d}`, title, body, url, trigger: { kind: 'weekly', weekday: d, hour, minute } });
    };
    for (const r of legacyList(data, 'routines')) if (r.enabled !== false && r.title) weekly(`routine-${r.id}`, r.title, `Rutina de las ${r.time}`, '/rutina', r.time, r.days);
    const pets = new Map(legacyList(data, 'pets').map((p) => [p.id, p.name]));
    for (const c of legacyList(data, 'petCares')) {
      const name = pets.get(c.petId);
      if (c.enabled !== false && name) weekly(`pet-${c.id}`, `${c.title || 'Cuidado'}: ${name}`, `A las ${c.time}`, '/mascotas', c.time, c.days);
    }
  }

  return out.slice(0, NOTIFY_MAX);
}

/** Una alarma con fecha y hora exactas (para el panel web y su servidor de avisos). */
export interface AlarmAt {
  id: string;
  /** ISO en UTC. */
  at: string;
  title: string;
  body: string;
  url: string;
}

/** Cuántos días por delante se programan en el servidor (el panel los renueva cada vez que se abre). */
export const ALARM_DAYS = 14;
export const ALARM_MAX = 200;

/**
 * Convierte el plan (semanal, mensual o con fecha) en alarmas concretas de los
 * próximos `days` días, con la hora local de este dispositivo. Un recordatorio
 * del día 31 suena el último día de los meses más cortos.
 */
export function expandNotificationPlan(plan: PlannedNotification[], now: Date = new Date(), days: number = ALARM_DAYS): AlarmAt[] {
  const out: AlarmAt[] = [];
  const end = now.getTime() + days * 86_400_000;
  const push = (p: PlannedNotification, at: Date) => {
    const t = at.getTime();
    if (t > now.getTime() && t <= end)
      out.push({
        id: `${p.id}@${at.toISOString()}`,
        at: at.toISOString(),
        title: p.title,
        body: p.body,
        url: p.url,
      });
  };
  for (const p of plan) {
    const t = p.trigger;
    if (t.kind === 'date') {
      push(p, new Date(t.at));
      continue;
    }
    for (let d = 0; d <= days; d++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, t.hour, t.minute, 0, 0);
      if (t.kind === 'weekly' && ((at.getDay() + 6) % 7) + 1 !== t.weekday) continue;
      if (t.kind === 'monthly') {
        const last = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
        if (Math.min(t.day, last) !== at.getDate()) continue;
      }
      push(p, at);
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, ALARM_MAX);
}

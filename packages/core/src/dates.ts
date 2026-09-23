/**
 * Fechas de calendario como texto 'YYYY-MM-DD' (el día local de la persona).
 * Toda la aritmética se hace en UTC para que no influya la zona del servidor.
 */

export type Day = string;
export type Period = 'day' | 'week' | 'month';

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(v: unknown): v is Day {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export const dayToDate = (d: Day): Date => new Date(`${d}T00:00:00Z`);
export const dateToDay = (d: Date): Day => d.toISOString().slice(0, 10);

export function addDays(d: Day, n: number): Day {
  const x = dayToDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return dateToDay(x);
}

/** Días entre a y b (b - a). */
export function diffDays(a: Day, b: Day): number {
  return Math.round((dayToDate(b).getTime() - dayToDate(a).getTime()) / 86_400_000);
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(d: Day): number {
  const w = dayToDate(d).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Hoy en la zona horaria indicada (IANA, p. ej. America/Mexico_City). */
export function todayIn(timeZone: string, now: Date = new Date()): Day {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    if (DAY_RE.test(parts)) return parts;
  } catch {
    /* zona inválida: se usa UTC */
  }
  return dateToDay(now);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface Range {
  from: Day;
  to: Day;
}

/** Rango del periodo que contiene `d`. Las semanas empiezan en lunes. */
export function periodRange(period: Period, d: Day): Range {
  if (period === 'day') return { from: d, to: d };
  if (period === 'week') {
    const from = addDays(d, 1 - isoWeekday(d));
    return { from, to: addDays(from, 6) };
  }
  const from = `${d.slice(0, 7)}-01`;
  const next = dayToDate(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(dateToDay(next), -1) };
}

/** El periodo inmediatamente anterior del mismo tipo. */
export function previousRange(period: Period, range: Range): Range {
  return periodRange(period, addDays(range.from, -1));
}

export function daysIn(range: Range): Day[] {
  const out: Day[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

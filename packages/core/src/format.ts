import { dayToDate, type Day } from './dates.js';

// Textos de fecha y cantidades en español, compartidos por la web y el móvil.

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es', { timeZone: 'UTC', ...opts });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Miércoles 23 de septiembre" */
export const longDay = (d: Day) => cap(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(dayToDate(d)).replace(',', ''));

/** "23 sept" */
export const shortDay = (d: Day) => fmt({ day: 'numeric', month: 'short' }).format(dayToDate(d)).replace('.', '');

/** "mié" */
export const weekdayShort = (d: Day) => fmt({ weekday: 'short' }).format(dayToDate(d)).replace('.', '');

/** "Septiembre de 2026" */
export const monthLabel = (d: Day) => cap(fmt({ month: 'long', year: 'numeric' }).format(dayToDate(d)));

export function rangeLabel(from: Day, to: Day): string {
  if (from === to) return longDay(from);
  if (from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01')) {
    const last = new Date(dayToDate(to));
    last.setUTCDate(last.getUTCDate() + 1);
    if (last.getUTCDate() === 1) return monthLabel(from);
  }
  return `${shortDay(from)} – ${shortDay(to)}`;
}

/** Saludo según la hora local del dispositivo. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export const firstName = (name: string | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Zona horaria del dispositivo, o UTC si el navegador no la da. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const WEEKDAY_NAMES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const WEEKDAYS = WEEKDAY_NAMES.map((label, i) => ({ iso: String(i + 1), label }));

const WEEKDAY_PLURALS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];

export function daysLabel(days: string): string {
  if (days === '1234567') return 'Todos los días';
  if (days === '12345') return 'Entre semana';
  if (days === '67') return 'Fines de semana';
  // Un solo día se lee mejor con su nombre que con una letra suelta.
  if (/^[1-7]$/.test(days)) return `Los ${WEEKDAY_PLURALS[Number(days) - 1]}`;
  return WEEKDAYS.filter((w) => days.includes(w.iso)).map((w) => w.label).join(' · ');
}

/** Zonas horarias de Latinoamérica (y España) con nombre de país, para mostrarlas primero en el selector. */
export const COMMON_TIMEZONES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'America/Caracas', label: 'Venezuela (Caracas)' },
  { id: 'America/Bogota', label: 'Colombia (Bogotá)' },
  { id: 'America/Mexico_City', label: 'México (Ciudad de México)' },
  { id: 'America/Lima', label: 'Perú (Lima)' },
  { id: 'America/Santiago', label: 'Chile (Santiago)' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
  { id: 'America/Guayaquil', label: 'Ecuador (Guayaquil)' },
  { id: 'America/La_Paz', label: 'Bolivia (La Paz)' },
  { id: 'America/Asuncion', label: 'Paraguay (Asunción)' },
  { id: 'America/Montevideo', label: 'Uruguay (Montevideo)' },
  { id: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
  { id: 'America/Panama', label: 'Panamá' },
  { id: 'America/Costa_Rica', label: 'Costa Rica' },
  { id: 'America/Guatemala', label: 'Guatemala' },
  { id: 'America/El_Salvador', label: 'El Salvador' },
  { id: 'America/Tegucigalpa', label: 'Honduras' },
  { id: 'America/Managua', label: 'Nicaragua' },
  { id: 'America/Santo_Domingo', label: 'República Dominicana' },
  { id: 'America/Havana', label: 'Cuba (La Habana)' },
  { id: 'America/Puerto_Rico', label: 'Puerto Rico' },
  { id: 'America/New_York', label: 'Estados Unidos (Nueva York, Miami)' },
  { id: 'America/Los_Angeles', label: 'Estados Unidos (Los Ángeles)' },
  { id: 'Europe/Madrid', label: 'España (Madrid)' },
];

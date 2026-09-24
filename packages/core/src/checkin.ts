import type { CheckInInput } from './schemas.js';

/** Valores del formulario de check-in: todos los campos, vacíos como null. */
export type CheckInValues = { [K in keyof CheckInInput]-?: CheckInInput[K] | null };

export const EMPTY_CHECK_IN: CheckInValues = {
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

/** Rellena el formulario con un check-in guardado (o vacío si no hay). */
export function fromCheckIn(c: { [K in keyof CheckInValues]?: CheckInValues[K] } | null | undefined): CheckInValues {
  if (!c) return EMPTY_CHECK_IN;
  return Object.fromEntries(Object.keys(EMPTY_CHECK_IN).map((k) => [k, c[k as keyof CheckInValues] ?? null])) as CheckInValues;
}

/** Lo que se envía: vacíos como null (la API los borra), textos recortados. */
export function toCheckInPayload(v: CheckInValues): CheckInValues {
  const text = (s: string | null) => (s && s.trim() ? s.trim() : null);
  return { ...v, note: text(v.note), gratitude: text(v.gratitude) };
}

/** Número escrito a mano ("7,5" también vale); vacío o inválido es null. */
export function parseNumber(s: string): number | null {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
}

import { z } from 'zod';
import { isDay, isValidTimeZone } from './dates.js';
import { ACTIVITY_LEVELS, PILLAR_IDS } from './pillars.js';

// Validación compartida por la API, la web y la app móvil.

export const pillarSchema = z.enum(PILLAR_IDS);
export const daySchema = z.string().refine(isDay, 'Fecha no válida (usa AAAA-MM-DD)');
const scale = z.number().int().min(1).max(5);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (usa HH:MM)');
/** Días de la semana como dígitos ISO: "1234567" = todos, "12345" = entre semana. */
const weekdays = z
  .string()
  .regex(/^[1-7]{1,7}$/, 'Días no válidos')
  .transform((s) => [...new Set(s)].sort().join(''));

/** Respuestas del onboarding y ajustes del perfil. Todo es opcional para poder guardarlo por pasos. */
export const profileInputSchema = z
  .object({
    focusPillars: z.array(pillarSchema).max(3).refine((a) => new Set(a).size === a.length, 'Pilares repetidos'),
    intention: z.string().trim().max(280),
    energyLevel: scale,
    activityLevel: z.enum(ACTIVITY_LEVELS),
    wakeTime: time,
    bedTime: time,
    timezone: z.string().refine(isValidTimeZone, 'Zona horaria no válida'),
    /** Autoevaluación inicial de cada pilar, 1 a 5. */
    baseline: z.object(Object.fromEntries(PILLAR_IDS.map((p) => [p, scale.optional()])) as Record<(typeof PILLAR_IDS)[number], z.ZodOptional<typeof scale>>),
    /** true cuando la persona termina el onboarding. */
    completeOnboarding: z.boolean(),
  })
  .partial()
  .strict();
export type ProfileInput = z.infer<typeof profileInputSchema>;

/** Check-in diario. Cada señal es opcional: se registra lo que la persona quiera. */
export const checkInInputSchema = z
  .object({
    mood: scale,
    energy: scale,
    stress: scale,
    sleepHours: z.number().min(0).max(24),
    sleepQuality: scale,
    activeMinutes: z.number().int().min(0).max(1440),
    nutrition: scale,
    water: z.number().int().min(0).max(40),
    connection: scale,
    purpose: scale,
    note: z.string().max(4000),
    gratitude: z.string().max(1000),
  })
  .partial()
  .strict();
export type CheckInInput = z.infer<typeof checkInInputSchema>;

export const habitInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    pillar: pillarSchema,
    days: weekdays.default('1234567'),
  })
  .strict();
export type HabitInput = z.infer<typeof habitInputSchema>;

export const habitPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    pillar: pillarSchema,
    days: weekdays,
    archived: z.boolean(),
  })
  .partial()
  .strict();
export type HabitPatch = z.infer<typeof habitPatchSchema>;

export const logInputSchema = z.object({ done: z.boolean() }).strict();

export const challengeStartSchema = z
  .object({
    key: z.string().min(1).max(60),
    startOn: daySchema.optional(),
    /** Id de un reto activo que este reemplaza (subir o bajar de nivel). */
    replaces: z.string().min(1).max(60).optional(),
  })
  .strict();

export const challengePatchSchema = z.object({ status: z.enum(['completed', 'abandoned']) }).strict();

export const periodSchema = z.enum(['day', 'week', 'month']);

export const accountDeleteSchema = z.object({ password: z.string().min(1).max(200) }).strict();

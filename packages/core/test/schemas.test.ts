import { describe, expect, it } from 'vitest';
import { PILLAR_IDS } from '../src/pillars.js';
import { checkInInputSchema, habitInputSchema, profileInputSchema } from '../src/schemas.js';
import { pillars } from '@dyc/tokens';

describe('validación', () => {
  it('acepta un check-in parcial y rechaza valores fuera de escala', () => {
    expect(checkInInputSchema.safeParse({ mood: 4 }).success).toBe(true);
    expect(checkInInputSchema.safeParse({ mood: 6 }).success).toBe(false);
    expect(checkInInputSchema.safeParse({ campoRaro: 1 }).success).toBe(false);
  });

  it('normaliza los días de un hábito', () => {
    expect(habitInputSchema.parse({ title: 'Leer', pillar: 'proposito', days: '5311' }).days).toBe('135');
    expect(habitInputSchema.parse({ title: 'Leer', pillar: 'proposito' }).days).toBe('1234567');
  });

  it('valida el perfil del onboarding', () => {
    expect(profileInputSchema.safeParse({ focusPillars: ['descanso', 'descanso'] }).success).toBe(false);
    expect(profileInputSchema.safeParse({ timezone: 'America/Bogota', wakeTime: '06:30', baseline: { descanso: 2 } }).success).toBe(true);
    expect(profileInputSchema.safeParse({ timezone: 'Luna/Base' }).success).toBe(false);
  });

  it('usa los mismos pilares que el sistema de diseño', () => {
    expect(pillars.map((p) => p.id)).toEqual([...PILLAR_IDS]);
  });
});

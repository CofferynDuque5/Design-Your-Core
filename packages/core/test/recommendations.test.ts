import { describe, expect, it } from 'vitest';
import { adjacentLevel, CHALLENGES } from '../src/challenges.js';
import { addDays } from '../src/dates.js';
import { PILLAR_IDS, pillarRecord } from '../src/pillars.js';
import { recommend, type RecommendationInput } from '../src/recommendations.js';

const today = '2026-09-23';
const base = (over: Partial<RecommendationInput> = {}): RecommendationInput => ({
  today,
  focusPillars: [],
  checkIns: [{ date: today, mood: 3 }],
  weekScores: pillarRecord(() => null),
  activeChallenges: [],
  dismissed: new Set(),
  ...over,
});

describe('catálogo de retos', () => {
  it('cada pilar tiene una secuencia de tres niveles', () => {
    for (const p of PILLAR_IDS) {
      const own = CHALLENGES.filter((c) => c.pillar === p);
      expect(own.map((c) => c.level).sort()).toEqual([1, 1, 2, 3]);
    }
    expect(new Set(CHALLENGES.map((c) => c.key)).size).toBe(CHALLENGES.length);
  });

  it('permite subir y bajar de nivel', () => {
    expect(adjacentLevel('caminar-1', 1)?.key).toBe('caminar-2');
    expect(adjacentLevel('caminar-1', -1)).toBeUndefined();
    expect(adjacentLevel('pausa-activa', 1)).toBeUndefined();
  });
});

describe('recomendaciones', () => {
  it('invita a registrar si hace días que no hay check-in', () => {
    const r = recommend(base({ checkIns: [{ date: addDays(today, -4), mood: 3 }] }));
    expect(r[0]).toMatchObject({ key: 'checkin-missing', action: { type: 'check-in' } });
    expect(r[0].reason).toContain('hace 4 días');
  });

  it('sugiere un reto de sueño con el dato que lo motiva', () => {
    const checkIns = [1, 2, 3].map((n) => ({ date: addDays(today, -n + 1), sleepHours: 6 }));
    const r = recommend(base({ checkIns }));
    const sleep = r.find((x) => x.key === 'sleep-short');
    expect(sleep?.action).toEqual({ type: 'start-challenge', challengeKey: 'dormir-1' });
    expect(sleep?.reason).toContain('3 de tus últimas 7 noches');
  });

  it('propone subir de nivel cuando el reto va muy bien y bajar cuando cuesta', () => {
    const up = recommend(base({ activeChallenges: [{ id: 'uc1', key: 'caminar-1', startedOn: addDays(today, -5), durationDays: 7, doneDays: 6 }] }));
    expect(up.find((r) => r.key === 'adapt-up:uc1')?.action).toEqual({ type: 'switch-challenge', userChallengeId: 'uc1', challengeKey: 'caminar-2' });

    const down = recommend(base({ activeChallenges: [{ id: 'uc2', key: 'dormir-2', startedOn: addDays(today, -4), durationDays: 7, doneDays: 1 }] }));
    expect(down.find((r) => r.key === 'adapt-down:uc2')?.action).toEqual({ type: 'switch-challenge', userChallengeId: 'uc2', challengeKey: 'dormir-1' });
  });

  it('detecta la relación sueño-energía en los datos de la persona', () => {
    const checkIns = [
      { date: addDays(today, -3), sleepHours: 8, energy: 5 },
      { date: addDays(today, -2), sleepHours: 7.5, energy: 4 },
      { date: addDays(today, -1), sleepHours: 5.5, energy: 2 },
      { date: today, sleepHours: 6, energy: 3 },
    ];
    const r = recommend(base({ checkIns }), 10);
    expect(r.find((x) => x.key === 'sleep-energy')?.body).toContain('4,5');
  });

  it('apunta al pilar más bajo y a los pilares elegidos, sin repetir retos', () => {
    const weekScores = { ...pillarRecord<number | null>(() => 80), relaciones: 40 };
    const r = recommend(base({ weekScores, focusPillars: ['relaciones', 'descanso'] }), 10);
    expect(r.find((x) => x.key === 'lowest:relaciones')?.action).toEqual({ type: 'start-challenge', challengeKey: 'conexion-1' });
    expect(r.find((x) => x.key === 'focus:relaciones')).toBeUndefined(); // mismo reto, no se duplica
    expect(r.find((x) => x.key === 'focus:descanso')).toBeDefined();
  });

  it('respeta lo descartado y el límite', () => {
    const r = recommend(base({ checkIns: [], dismissed: new Set(['checkin-missing']), focusPillars: ['movimiento', 'descanso', 'enfoque', 'proposito'] }));
    expect(r.map((x) => x.key)).not.toContain('checkin-missing');
    expect(r).toHaveLength(3);
  });
});

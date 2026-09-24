import { describe, expect, it } from 'vitest';
import { averageScores, dayScores, isScheduled, overallScore, sleepHoursScore } from '../src/scoring.js';

describe('puntuación por pilar', () => {
  it('no puntúa lo que no se registró', () => {
    const s = dayScores({ mood: 5 });
    expect(s.enfoque).toBe(100);
    expect(s.descanso).toBeNull();
    expect(s.movimiento).toBeNull();
  });

  it('combina las señales de cada pilar', () => {
    const s = dayScores({ sleepHours: 8, sleepQuality: 3, activeMinutes: 15, energy: 5, stress: 5, mood: 3, water: 8, nutrition: 1 });
    expect(s.descanso).toBe(75); // (1 + 0.5) / 2
    expect(s.movimiento).toBe(75); // (0.5 + 1) / 2
    expect(s.enfoque).toBe(25); // (0.5 + 0) / 2
    expect(s.alimentacion).toBe(50);
  });

  it('penaliza dormir poco o demasiado de forma gradual', () => {
    expect(sleepHoursScore(7.5)).toBe(1);
    expect(sleepHoursScore(5)).toBe(0.5);
    expect(sleepHoursScore(3)).toBe(0);
    expect(sleepHoursScore(10.5)).toBe(0.5);
  });

  it('una reflexión suma a propósito', () => {
    expect(dayScores({ note: '  ' }).proposito).toBeNull();
    expect(dayScores({ purpose: 1, gratitude: 'mi hermana' }).proposito).toBe(50);
  });

  it('mezcla check-in (70%) y hábitos (30%)', () => {
    const s = dayScores({ connection: 5 }, [
      { pillar: 'relaciones', done: false },
      { pillar: 'movimiento', done: true },
      { pillar: 'movimiento', done: false },
    ]);
    expect(s.relaciones).toBe(70);
    expect(s.movimiento).toBe(50);
  });

  it('promedia días y calcula la puntuación global', () => {
    const { scores, daysWithData } = averageScores([dayScores({ mood: 5 }), dayScores({ mood: 1 }), dayScores({})]);
    expect(scores.enfoque).toBe(50);
    expect(daysWithData.enfoque).toBe(2);
    expect(scores.descanso).toBeNull();
    expect(overallScore(scores)).toBe(50);
    expect(overallScore(dayScores({}))).toBeNull();
  });

  it('sabe qué días toca cada hábito', () => {
    expect(isScheduled('12345', '2026-09-23')).toBe(true);
    expect(isScheduled('12345', '2026-09-20')).toBe(false);
  });
});

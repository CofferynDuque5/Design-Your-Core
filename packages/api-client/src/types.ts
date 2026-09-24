import type { Challenge, Day, Period, PillarId, PillarScores, Range, Recommendation } from '@dyc/core';

// Formas de las respuestas de la API (ver docs/api.md).

export interface User {
  id: string;
  email: string;
  name: string;
  gender: 'mujer' | 'hombre' | 'otro';
  showCycle: boolean;
}

export interface Session {
  token: string;
  user: User;
}

/** Sesión renovable: acceso corto + renovación que rota en cada uso. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Segundos de validez del token de acceso. */
  expiresIn: number;
  user: User;
}

export interface Profile {
  focusPillars: PillarId[];
  intention: string | null;
  energyLevel: number | null;
  activityLevel: 'sedentaria' | 'ligera' | 'moderada' | 'alta' | null;
  wakeTime: string | null;
  bedTime: string | null;
  timezone: string;
  baseline: Partial<Record<PillarId, number>>;
  onboarded: boolean;
  onboardedAt: string | null;
}

export interface CheckIn {
  date: Day;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  activeMinutes: number | null;
  nutrition: number | null;
  water: number | null;
  connection: number | null;
  purpose: number | null;
  note: string | null;
  gratitude: string | null;
  updatedAt: string;
}

export interface Habit {
  id: string;
  title: string;
  pillar: PillarId;
  days: string;
  startsOn: Day;
  archived: boolean;
  createdAt: string;
  recent?: Array<{ date: Day; done: boolean }>;
}

export interface UserChallenge {
  id: string;
  key: string;
  pillar: PillarId;
  title: string;
  description: string;
  level: 1 | 2 | 3 | null;
  status: 'active' | 'completed' | 'abandoned';
  startedOn: Day;
  endsOn: Day;
  durationDays: number;
  dayNumber: number;
  doneDays: number;
  doneToday: boolean;
  log: Array<{ date: Day; done: boolean }>;
}

export interface PillarSummary {
  id: PillarId;
  score: number | null;
  previous: number | null;
  delta: number | null;
  daysWithData: number;
}

export interface Dashboard {
  period: Period;
  date: Day;
  today: Day;
  range: Range;
  previousRange: Range;
  overall: { score: number | null; previous: number | null };
  pillars: PillarSummary[];
  series: Array<{ date: Day; overall: number | null; pillars: PillarScores | null }>;
  habits: { scheduled: number; done: number };
  checkIns: { count: number; streak: number };
  todayStatus: { checkIn: CheckIn | null; habits: Array<{ id: string; title: string; pillar: PillarId; done: boolean }> };
  challenges: UserChallenge[];
  recommendations: Recommendation[];
  onboarded: boolean;
}

/** Resumen de la pareja vinculada (hábitos de la app anterior). */
export interface PartnerView {
  partner: { name: string } | null;
  habits?: Array<{ label: string; done: boolean; streak: number }>;
  doneToday?: number;
  total?: number;
}

export interface AccountExport {
  exportedAt: string;
  user: User;
  profile: Profile;
  checkIns: CheckIn[];
  habits: Array<Habit & { logs: Array<{ date: Day; done: boolean }> }>;
  challenges: UserChallenge[];
  legacy: unknown;
}

export type { Challenge, Recommendation };
export type { RecommendationAction } from '@dyc/core';

// Filas de la base de datos (mismas tablas y columnas que creaba Prisma, ver migrations/).

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  inviteCode: string | null;
  partnerId: string | null;
  gender: string | null;
  showCycle: boolean;
  tokenVersion: number;
  resetTokenHash: string | null;
  resetExpires: Date | null;
  createdAt: Date;
}

export interface Blob {
  userId: string;
  data: unknown;
  updatedAt: Date;
}

export interface Image {
  id: string;
  userId: string;
  data: string;
  createdAt: Date;
}

export interface Profile {
  userId: string;
  focusPillars: string[];
  intention: string | null;
  energyLevel: number | null;
  activityLevel: string | null;
  wakeTime: string | null;
  bedTime: string | null;
  timezone: string;
  baseline: unknown;
  onboardedAt: Date | null;
  updatedAt: Date;
}

export interface CheckIn {
  id: string;
  userId: string;
  date: Date;
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
  updatedAt: Date;
}

export interface Habit {
  id: string;
  userId: string;
  pillar: string;
  title: string;
  days: string;
  startsOn: Date;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface HabitLog {
  habitId: string;
  date: Date;
  done: boolean;
}

export interface UserChallenge {
  id: string;
  userId: string;
  challengeKey: string;
  pillar: string;
  startedOn: Date;
  durationDays: number;
  status: string;
  endedAt: Date | null;
  createdAt: Date;
}

export interface ChallengeLog {
  userChallengeId: string;
  date: Date;
  done: boolean;
}

export interface Dismissal {
  userId: string;
  key: string;
  until: Date;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  family: string;
  tokenVersion: number;
  deviceName: string | null;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

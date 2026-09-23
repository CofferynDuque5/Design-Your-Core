/** Los seis pilares, en el orden en que se presentan siempre. */
export const PILLAR_IDS = ['movimiento', 'descanso', 'alimentacion', 'enfoque', 'relaciones', 'proposito'] as const;

export type PillarId = (typeof PILLAR_IDS)[number];

export const PILLAR_NAMES: Record<PillarId, string> = {
  movimiento: 'Energía y movimiento',
  descanso: 'Descanso',
  alimentacion: 'Alimentación',
  enfoque: 'Enfoque mental',
  relaciones: 'Relaciones',
  proposito: 'Propósito personal',
};

export const isPillarId = (v: unknown): v is PillarId => typeof v === 'string' && (PILLAR_IDS as readonly string[]).includes(v);

export type PillarRecord<T> = Record<PillarId, T>;

export function pillarRecord<T>(fn: (id: PillarId) => T): PillarRecord<T> {
  return Object.fromEntries(PILLAR_IDS.map((id) => [id, fn(id)])) as PillarRecord<T>;
}

import { z } from 'zod';

/**
 * Espacio en pareja: lo que las dos personas vinculadas comparten y editan
 * juntas. Fotos (galería), metas y emprendimientos en común. Vive en el
 * servidor, en una lista común a la pareja; si se desvinculan y vuelven a
 * vincularse, lo compartido sigue ahí.
 */

export const COUPLE_KINDS = ['foto', 'meta', 'emprendimiento'] as const;
export type CoupleKind = (typeof COUPLE_KINDS)[number];

export const COUPLE_KIND_LABEL: Record<CoupleKind, string> = { foto: 'Fotos', meta: 'Metas', emprendimiento: 'Emprendimientos' };

export const COUPLE_VENTURE_STAGES = ['idea', 'planeando', 'en-marcha', 'creciendo', 'pausa'] as const;
export type CoupleVentureStage = (typeof COUPLE_VENTURE_STAGES)[number];
export const COUPLE_VENTURE_STAGE_LABEL: Record<CoupleVentureStage, string> = {
  idea: 'Idea',
  planeando: 'Planeando',
  'en-marcha': 'En marcha',
  creciendo: 'Creciendo',
  pausa: 'En pausa',
};

/** Máximo de elementos compartidos por pareja (fotos incluidas). */
export const COUPLE_ITEMS_MAX = 600;
/** Foto completa (data URL JPEG, ya reducida en el dispositivo). */
export const COUPLE_PHOTO_MAX = 1_500_000;
/** Miniatura para la galería. */
export const COUPLE_THUMB_MAX = 120_000;

const day = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida')]);
const jpeg = (max: number) => z.string().max(max, 'La foto es demasiado grande').regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Foto no válida');
const task = z.object({ id: z.string().min(1).max(64), name: z.string().trim().min(1).max(200), done: z.boolean().default(false) }).strict();

export const coupleDataSchemas = {
  foto: z.object({ caption: z.string().trim().max(300).default(''), takenOn: day.default('') }).strict(),
  meta: z
    .object({
      title: z.string().trim().min(1, 'Escribe la meta').max(160),
      note: z.string().trim().max(2000).default(''),
      deadline: day.default(''),
      done: z.boolean().default(false),
      steps: z.array(task).max(50).default([]),
    })
    .strict(),
  emprendimiento: z
    .object({
      name: z.string().trim().min(1, 'Escribe el nombre').max(120),
      description: z.string().trim().max(5000).default(''),
      stage: z.enum(COUPLE_VENTURE_STAGES).default('idea'),
      tasks: z.array(task).max(200).default([]),
    })
    .strict(),
} as const;

export type CoupleData = {
  foto: z.infer<(typeof coupleDataSchemas)['foto']>;
  meta: z.infer<(typeof coupleDataSchemas)['meta']>;
  emprendimiento: z.infer<(typeof coupleDataSchemas)['emprendimiento']>;
};

export const coupleCreateInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('foto'), data: coupleDataSchemas.foto, image: jpeg(COUPLE_PHOTO_MAX), thumb: jpeg(COUPLE_THUMB_MAX) }).strict(),
  z.object({ kind: z.literal('meta'), data: coupleDataSchemas.meta }).strict(),
  z.object({ kind: z.literal('emprendimiento'), data: coupleDataSchemas.emprendimiento }).strict(),
]);
export type CoupleCreateInput = z.infer<typeof coupleCreateInput>;

export interface CoupleItem<K extends CoupleKind = CoupleKind> {
  id: string;
  kind: K;
  data: CoupleData[K];
  /** Miniatura (solo las fotos). */
  thumb?: string;
  /** Quién lo agregó: «tú» o el nombre de tu pareja. */
  byMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoupleSpace {
  partner: { name: string } | null;
  items: CoupleItem[];
}

/** Clave común de la pareja: los dos ids en orden, así da igual quién la pida. */
export const pairKey = (a: string, b: string): string => [a, b].sort().join(':');

/** Avance de una meta o emprendimiento compartido, 0–100. */
export function coupleProgress(list: ReadonlyArray<{ done?: boolean }>, done = false): number {
  if (done) return 100;
  if (!list.length) return 0;
  return Math.round((list.filter((t) => t.done).length / list.length) * 100);
}

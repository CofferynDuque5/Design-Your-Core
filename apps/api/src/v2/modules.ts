import { FOCUS_MAX, isLegacyKey, LEGACY_CHILDREN, LEGACY_CROSS, LEGACY_PARENT, legacyItemSchemas, legacyList, legacyPatchSchemas, legacyReorderSchema, mergeLegacyItem, reorderById, type LegacyKey } from '@dyc/core';
import type { Prisma, PrismaClient } from '@prisma/client';
import { Router, type RequestHandler, type Response } from 'express';
import { ah } from '../lib/http.js';
import { parse } from './util.js';

type Doc = Record<string, unknown>;
type Item = Record<string, unknown> & { id: string };

/** La lista de una clave; si falta o no es una lista, vacía (como `x || []` en la app anterior). */
const rawList = (doc: Doc, key: string): Item[] => (Array.isArray(doc[key]) ? (doc[key] as Item[]) : []);
const idOf = (x: unknown) => (x && typeof x === 'object' ? (x as { id?: unknown }).id : undefined);

/** Error con respuesta HTTP que se lanza dentro de la transacción para deshacerla. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Módulos de la app anterior, elemento a elemento, sobre el mismo documento
 * JSON de /api/sync. Cada escritura bloquea la fila del documento, cambia solo
 * su clave y conserva todas las demás (también las que esta API no conoce).
 */
export function moduleRoutes({ prisma, requireAuth }: { prisma: PrismaClient; requireAuth: RequestHandler }): Router {
  const r = Router();

  /** Lee el documento con la fila bloqueada, aplica `fn` a la lista y guarda. */
  async function edit<T>(userId: string, key: LegacyKey, fn: (list: Item[], doc: Doc) => { list: Item[]; result: T; also?: Doc }) {
    return prisma.$transaction(
      async (tx) => {
        const lock = () => tx.$queryRaw<Array<{ data: unknown }>>`SELECT "data" FROM "Blob" WHERE "userId" = ${userId} FOR UPDATE`;
        let rows = await lock();
        if (!rows.length) {
          await tx.$executeRaw`INSERT INTO "Blob" ("userId", "data", "updatedAt") VALUES (${userId}, '{}'::jsonb, now()) ON CONFLICT ("userId") DO NOTHING`;
          rows = await lock();
        }
        const raw = rows[0]?.data;
        const doc: Doc = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Doc) : {};
        // Se trabaja sobre la lista tal cual (sin filtrar) para no perder nada de lo guardado.
        const { list, result, also } = fn(rawList(doc, key), doc);
        const next = { ...doc, ...also, [key]: list } as Prisma.InputJsonObject;
        const saved = await tx.blob.update({ where: { userId }, data: { data: next } });
        return { result, updatedAt: saved.updatedAt };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }

  const keyParam = (key: string, res: Response): LegacyKey | null => {
    if (isLegacyKey(key)) return key;
    res.status(404).json({ error: 'Módulo no encontrado' });
    return null;
  };

  const run = async (res: Response, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  };

  const ids = (doc: Doc, key: LegacyKey) => new Set(legacyList(doc, key).map((x) => (x as { id: string }).id));

  // Comprobaciones que dependen del resto del documento.
  const checkRelations = (key: LegacyKey, item: Doc, doc: Doc) => {
    const parent = LEGACY_PARENT[key];
    const ref = parent ? item[parent.field] : undefined;
    if (parent && typeof ref === 'string' && !ids(doc, parent.key).has(ref)) throw new HttpError(400, key === 'subtasks' ? 'La tarea principal no existe' : 'El cuaderno no existe');
    if (key === 'classes' && typeof item.subject === 'string' && item.subject) {
      const subjects = Array.isArray(doc.subjects) ? (doc.subjects as Array<{ id?: unknown }>) : [];
      if (!subjects.some((s) => s && s.id === item.subject)) throw new HttpError(400, 'La materia no existe');
    }
  };

  // Todo el documento, igual que GET /api/sync.
  r.get('/modules', requireAuth, ah(async (req, res) => {
    const blob = await prisma.blob.findUnique({ where: { userId: req.userId } });
    res.json({ data: blob?.data ?? {}, updatedAt: blob?.updatedAt ?? null });
  }));

  r.post('/modules/:key', requireAuth, ah(async (req, res) => {
    const key = keyParam(req.params.key, res);
    if (!key) return;
    const item = parse(legacyItemSchemas[key], req.body?.item, res) as Item | null;
    if (!item) return;
    await run(res, async () => {
      const out = await edit(req.userId as string, key, (list, doc) => {
        if (list.some((x) => idOf(x) === item.id)) throw new HttpError(409, 'Ya existe un elemento con ese id');
        checkRelations(key, item, doc);
        // Enfoque: la más reciente primero y como mucho 500, como la app anterior.
        return { list: key === 'focus' ? [item, ...list].slice(0, FOCUS_MAX) : [...list, item], result: item };
      });
      res.status(201).json({ item: out.result, updatedAt: out.updatedAt });
    });
  }));

  // Reordenar va antes que /:id para que "order" no se tome por un id.
  r.put('/modules/:key/order', requireAuth, ah(async (req, res) => {
    const key = keyParam(req.params.key, res);
    if (!key) return;
    const input = parse(legacyReorderSchema, req.body, res);
    if (!input) return;
    const out = await edit(req.userId as string, key, (list) => ({ list: reorderById(list, input.ids), result: null }));
    res.json({ ok: true, updatedAt: out.updatedAt });
  }));

  r.patch('/modules/:key/:id', requireAuth, ah(async (req, res) => {
    const key = keyParam(req.params.key, res);
    if (!key) return;
    const patch = parse(legacyPatchSchemas[key], req.body, res) as Doc | null;
    if (!patch) return;
    if (key === 'tasks' && 'time' in patch) patch.rem = !!patch.time;
    await run(res, async () => {
      const out = await edit(req.userId as string, key, (list, doc) => {
        const i = list.findIndex((x) => idOf(x) === req.params.id);
        if (i < 0) throw new HttpError(404, 'Elemento no encontrado');
        // Los campos que esta API no conoce se conservan, también en temas, hitos y pasos.
        const item = mergeLegacyItem(key, list[i], patch);
        const cross = LEGACY_CROSS[key];
        const msg = cross && cross.fields.some((f) => f in patch) ? cross.check(item) : null;
        if (msg) throw new HttpError(400, `Datos inválidos: ${msg}`);
        checkRelations(key, patch, doc);
        const next = [...list];
        next[i] = item;
        return { list: next, result: item };
      });
      res.json({ item: out.result, updatedAt: out.updatedAt });
    });
  }));

  r.delete('/modules/:key/:id', requireAuth, ah(async (req, res) => {
    const key = keyParam(req.params.key, res);
    if (!key) return;
    await run(res, async () => {
      const out = await edit(req.userId as string, key, (list, doc) => {
        if (!list.some((x) => idOf(x) === req.params.id)) throw new HttpError(404, 'Elemento no encontrado');
        // Borrar un pendiente borra sus subtareas y un cuaderno sus cajitas, como la app anterior.
        // Borrar una materia NO borra sus clases ni sus proyectos (tampoco en la app anterior).
        const child = LEGACY_CHILDREN[key];
        const also = child ? { [child.key]: rawList(doc, child.key).filter((s) => !s || s[child.field] !== req.params.id) } : undefined;
        return { list: list.filter((x) => idOf(x) !== req.params.id), result: null, also };
      });
      res.json({ ok: true, updatedAt: out.updatedAt });
    });
  }));

  return r;
}

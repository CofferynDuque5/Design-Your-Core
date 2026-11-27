import {
  deriveLegacyPatch,
  isLegacyKey,
  isLegacyObjectKey,
  LEGACY_CHILDREN,
  LEGACY_CROSS,
  LEGACY_NEWEST_FIRST,
  LEGACY_PARENT,
  LEGACY_UNIQUE,
  legacyItemSchemas,
  legacyList,
  legacyObjectDefaults,
  legacyObjectPatchSchemas,
  legacyObjectSchemas,
  legacyPatchSchemas,
  legacyReorderSchema,
  mergeLegacyItem,
  reorderById,
  VAULT_MAX_ITEMS,
  vaultItemPatchSchema,
  vaultItemSchema,
  vaultMigrateSchema,
  vaultSecureSchema,
  type LegacyKey,
  type LegacyObjectKey,
} from '@dyc/core';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { Db } from '../db/db.js';
import { COURSES, courseExists, deleteCourses, findCourse, insertCourse, moveCoursesOut, readDoc, reorderCourses, updateCourse, withCourses } from '../db/courses.js';
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
export function moduleRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();

  /**
   * Lee el documento con la fila bloqueada, aplica `fn` y guarda las claves que
   * devuelve en `set` (y quita las de `unset`); el resto queda igual.
   */
  async function withDoc<T>(userId: string, fn: (doc: Doc) => { set: Doc; unset?: string[]; result: T }) {
    return db.tx(async (tx) => {
      const lock = () => tx.rows<{ data: unknown }>('SELECT "data" FROM "Blob" WHERE "userId" = $1 FOR UPDATE', [userId]);
      let rows = await lock();
      if (!rows.length) {
        await tx.exec('INSERT INTO "Blob" ("userId", "data", "updatedAt") VALUES ($1, \'{}\'::jsonb, $2) ON CONFLICT ("userId") DO NOTHING', [userId, new Date()]);
        rows = await lock();
      }
      // Los cursos viven en "CourseItem"; si alguno sigue en el documento, se mueve antes.
      const raw0 = rows[0]?.data as Doc | undefined;
      if (raw0 && Array.isArray(raw0[COURSES]) && (await moveCoursesOut(tx, userId))) rows = await lock();
      const raw = rows[0]?.data;
      const doc: Doc = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Doc) : {};
      const { set, unset = [], result } = fn(doc);
      const next = Object.fromEntries(Object.entries({ ...doc, ...set }).filter(([k]) => !unset.includes(k)));
      const saved = await tx.row<{ updatedAt: Date }>('UPDATE "Blob" SET "data" = $2::jsonb, "updatedAt" = $3 WHERE "userId" = $1 RETURNING "updatedAt"', [
        userId,
        JSON.stringify(next),
        new Date(),
      ]);
      return { result, updatedAt: saved?.updatedAt ?? null };
    });
  }

  /** Edita la lista de una clave (tal cual, sin filtrar, para no perder nada de lo guardado). */
  const edit = <T>(userId: string, key: LegacyKey, fn: (list: Item[], doc: Doc) => { list: Item[]; result: T; also?: Doc }) =>
    withDoc(userId, (doc) => {
      const { list, result, also } = fn(rawList(doc, key), doc);
      return { set: { ...also, [key]: list }, result };
    });

  const objectParam = (key: string, res: Response): LegacyObjectKey | null => {
    if (isLegacyObjectKey(key)) return key;
    res.status(404).json({ error: 'Módulo no encontrado' });
    return null;
  };

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
    if (parent && typeof ref === 'string' && !ids(doc, parent.key).has(ref)) throw new HttpError(400, parent.missing);
    if (key === 'classes' && typeof item.subject === 'string' && item.subject) {
      const subjects = Array.isArray(doc.subjects) ? (doc.subjects as Array<{ id?: unknown }>) : [];
      if (!subjects.some((s) => s && s.id === item.subject)) throw new HttpError(400, 'La materia no existe');
    }
  };

  // Un registro por fecha (Ciclo y Diario), como la app anterior.
  const checkUnique = (key: LegacyKey, item: Doc, list: Item[], id: string) => {
    const unique = LEGACY_UNIQUE[key];
    if (unique && unique.field in item && list.some((x) => x && idOf(x) !== id && x[unique.field] === item[unique.field])) throw new HttpError(409, unique.message);
  };

  // ---------- Bóveda cifrada (`vaultSecure`) ----------
  // El navegador cifra; aquí solo se valida la forma y el tamaño. Van antes que
  // las rutas genéricas para que «vaultSecure» no se tome por una clave de lista.

  const vaultOf = (doc: Doc) => {
    const v = doc.vaultSecure;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Doc & { items?: unknown }) : null;
  };
  const vaultItems = (v: Doc & { items?: unknown }) => (Array.isArray(v.items) ? (v.items as Item[]) : []);
  const noVault = () => new HttpError(404, 'Aún no has creado la bóveda');

  // Crear: nunca sustituye una bóveda que ya existe (se haría perder sus entradas).
  r.put('/modules/vaultSecure', requireAuth, ah(async (req, res) => {
    const vault = parse(vaultSecureSchema, req.body, res);
    if (!vault) return;
    await run(res, async () => {
      const out = await withDoc(req.userId as string, (doc) => {
        if (vaultOf(doc)) throw new HttpError(409, 'Ya tienes una bóveda');
        return { set: { vaultSecure: vault }, result: vault };
      });
      res.status(201).json({ value: out.result, updatedAt: out.updatedAt });
    });
  }));

  // Borrar toda la bóveda (p. ej. si se olvidó la contraseña maestra). La lista antigua `vault` no se toca.
  r.delete('/modules/vaultSecure', requireAuth, ah(async (req, res) => {
    const out = await withDoc(req.userId as string, () => ({ set: {}, unset: ['vaultSecure'], result: null }));
    res.json({ ok: true, updatedAt: out.updatedAt });
  }));

  /** Cambia las entradas de la bóveda, que tiene que existir. */
  const editVault = <T>(userId: string, fn: (items: Item[], doc: Doc) => { items: Item[]; result: T; also?: Doc }) =>
    withDoc(userId, (doc) => {
      const vault = vaultOf(doc);
      if (!vault) throw noVault();
      const { items, result, also } = fn(vaultItems(vault), doc);
      if (items.length > VAULT_MAX_ITEMS) throw new HttpError(400, `La bóveda admite hasta ${VAULT_MAX_ITEMS} entradas`);
      return { set: { ...also, vaultSecure: { ...vault, items } }, result };
    });

  r.post('/modules/vaultSecure/items', requireAuth, ah(async (req, res) => {
    const item = parse(vaultItemSchema, req.body?.item, res);
    if (!item) return;
    await run(res, async () => {
      const out = await editVault(req.userId as string, (items) => {
        if (items.some((x) => idOf(x) === item.id)) throw new HttpError(409, 'Ya existe un elemento con ese id');
        return { items: [...items, item as Item], result: item };
      });
      res.status(201).json({ item: out.result, updatedAt: out.updatedAt });
    });
  }));

  r.put('/modules/vaultSecure/items/:id', requireAuth, ah(async (req, res) => {
    const patch = parse(vaultItemPatchSchema, req.body, res);
    if (!patch) return;
    await run(res, async () => {
      const out = await editVault(req.userId as string, (items) => {
        const i = items.findIndex((x) => idOf(x) === req.params.id);
        if (i < 0) throw new HttpError(404, 'Elemento no encontrado');
        const next = [...items];
        next[i] = { id: req.params.id, ...patch };
        return { items: next, result: next[i] };
      });
      res.json({ item: out.result, updatedAt: out.updatedAt });
    });
  }));

  r.delete('/modules/vaultSecure/items/:id', requireAuth, ah(async (req, res) => {
    await run(res, async () => {
      const out = await editVault(req.userId as string, (items) => {
        if (!items.some((x) => idOf(x) === req.params.id)) throw new HttpError(404, 'Elemento no encontrado');
        return { items: items.filter((x) => idOf(x) !== req.params.id), result: null };
      });
      res.json({ ok: true, updatedAt: out.updatedAt });
    });
  }));

  // Migración confirmada: añade las entradas cifradas y quita de la lista
  // antigua `vault` (texto plano) las que cifran, en una sola escritura. Lo que
  // la app anterior haya añadido después se queda en `vault`.
  r.post('/modules/vaultSecure/migrate', requireAuth, ah(async (req, res) => {
    const input = parse(vaultMigrateSchema, req.body, res);
    if (!input) return;
    await run(res, async () => {
      const out = await editVault(req.userId as string, (items, doc) => {
        const taken = new Set(items.map(idOf));
        if (input.items.some((x) => taken.has(x.id))) throw new HttpError(409, 'Ya existe un elemento con ese id');
        const drop = new Set(input.legacyIds);
        const legacy = Array.isArray(doc.vault) ? (doc.vault as unknown[]) : [];
        const vault = legacy.filter((x) => !(typeof idOf(x) === 'string' && drop.has(idOf(x) as string)));
        return { items: [...items, ...input.items], result: { migrated: input.items.length, remaining: vault.length }, also: { vault } };
      });
      res.json({ ...out.result, updatedAt: out.updatedAt });
    });
  }));

  // Todo el documento, igual que GET /api/sync.
  r.get('/modules', requireAuth, ah(async (req, res) => {
    const doc = await readDoc(db, req.userId as string);
    res.json({ data: doc?.data ?? {}, updatedAt: doc?.updatedAt ?? null });
  }));

  // ---------- Cursos (tabla "CourseItem", una fila por curso) ----------
  // Mismas reglas y respuestas que las rutas genéricas de abajo, pero cada
  // cambio toca solo la fila de ese curso. Van antes para tener prioridad.

  r.post(`/modules/${COURSES}`, requireAuth, ah(async (req, res) => {
    const item = parse(legacyItemSchemas.courses, req.body?.item, res) as Item | null;
    if (!item) return;
    await run(res, async () => {
      const out = await withCourses(db, req.userId as string, async (t) => {
        if (await courseExists(t, item.id)) throw new HttpError(409, 'Ya existe un elemento con ese id');
        const row = await insertCourse(t, item);
        return { result: item, patchCache: (rows) => [...rows, row] };
      });
      res.status(201).json({ item: out.result, updatedAt: out.updatedAt });
    });
  }));

  // Quitar varios cursos de una vez (los repetidos). Antes se guarda copia en "BlobBackup".
  r.post(`/modules/${COURSES}/remove-many`, requireAuth, ah(async (req, res) => {
    const raw = req.body?.ids;
    const ids = Array.isArray(raw) ? [...new Set(raw.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200))] : [];
    if (!ids.length || ids.length > 5000) return res.status(400).json({ error: 'Envía entre 1 y 5000 ids' });
    const userId = req.userId as string;
    const out = await withCourses(db, userId, async (t) => {
      await t.sql.exec(
        `INSERT INTO "BlobBackup" ("userId", "data", "reason")
         SELECT $1, jsonb_build_object('courses', jsonb_agg("data" ORDER BY "pos")), 'cursos repetidos quitados'
           FROM "CourseItem" WHERE "userId" = $1 AND "itemId" = ANY($2) HAVING count(*) > 0`,
        [userId, ids],
      );
      const gone = await t.sql.rows<{ itemId: string }>('DELETE FROM "CourseItem" WHERE "userId" = $1 AND "itemId" = ANY($2) RETURNING "itemId"', [userId, ids]);
      const set = new Set(ids);
      return { result: gone.length, patchCache: (rows) => rows.filter((r) => !r.itemId || !set.has(r.itemId)) };
    });
    res.json({ ok: true, removed: out.result, updatedAt: out.updatedAt });
  }));

  r.put(`/modules/${COURSES}/order`, requireAuth, ah(async (req, res) => {
    const input = parse(legacyReorderSchema, req.body, res);
    if (!input) return;
    const out = await withCourses(db, req.userId as string, async (t) => {
      const pos = await reorderCourses(t, input.ids);
      return { result: null, patchCache: (rows) => rows.map((r) => ({ ...r, pos: pos.get(r.key) ?? r.pos })) };
    });
    res.json({ ok: true, updatedAt: out.updatedAt });
  }));

  r.patch(`/modules/${COURSES}/:id`, requireAuth, ah(async (req, res) => {
    const parsed = parse(legacyPatchSchemas.courses, req.body, res) as Doc | null;
    if (!parsed) return;
    const patch = deriveLegacyPatch(COURSES, parsed);
    await run(res, async () => {
      const out = await withCourses(db, req.userId as string, async (t) => {
        const row = await findCourse(t, req.params.id);
        if (!row) throw new HttpError(404, 'Elemento no encontrado');
        const before = (row.data && typeof row.data === 'object' ? row.data : { id: req.params.id }) as Item;
        const item = mergeLegacyItem(COURSES, before, patch);
        const cross = LEGACY_CROSS.courses;
        const msg = cross && cross.fields.some((f) => f in patch) ? cross.check(item) : null;
        if (msg) throw new HttpError(400, `Datos inválidos: ${msg}`);
        await updateCourse(t, row.key, item);
        return { result: item, patchCache: (rows) => rows.map((r) => (r.key === row.key ? { ...r, data: item } : r)) };
      });
      res.json({ item: out.result, updatedAt: out.updatedAt });
    });
  }));

  r.delete(`/modules/${COURSES}/:id`, requireAuth, ah(async (req, res) => {
    await run(res, async () => {
      const out = await withCourses(db, req.userId as string, async (t) => {
        if (!(await deleteCourses(t, req.params.id))) throw new HttpError(404, 'Elemento no encontrado');
        return { result: null, patchCache: (rows) => rows.filter((r) => r.itemId !== req.params.id) };
      });
      res.json({ ok: true, updatedAt: out.updatedAt });
    });
  }));

  r.post('/modules/:key', requireAuth, ah(async (req, res) => {
    const key = keyParam(req.params.key, res);
    if (!key) return;
    const item = parse(legacyItemSchemas[key], req.body?.item, res) as Item | null;
    if (!item) return;
    await run(res, async () => {
      const out = await edit(req.userId as string, key, (list, doc) => {
        if (list.some((x) => idOf(x) === item.id)) throw new HttpError(409, 'Ya existe un elemento con ese id');
        checkUnique(key, item, list, item.id);
        checkRelations(key, item, doc);
        // Enfoque, finanzas, entrenos y sueño: lo más reciente primero y con su máximo, como la app anterior.
        const max = LEGACY_NEWEST_FIRST[key];
        return { list: max ? [item, ...list].slice(0, max) : [...list, item], result: item };
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
    const parsed = parse(legacyPatchSchemas[key], req.body, res) as Doc | null;
    if (!parsed) return;
    // Campos derivados: `rem` de las tareas, extracto y color de las notas.
    const patch = deriveLegacyPatch(key, parsed);
    await run(res, async () => {
      const out = await edit(req.userId as string, key, (list, doc) => {
        const i = list.findIndex((x) => idOf(x) === req.params.id);
        if (i < 0) throw new HttpError(404, 'Elemento no encontrado');
        // Los campos que esta API no conoce se conservan, también en temas, hitos y pasos.
        const item = mergeLegacyItem(key, list[i], patch);
        const cross = LEGACY_CROSS[key];
        const msg = cross && cross.fields.some((f) => f in patch) ? cross.check(item) : null;
        if (msg) throw new HttpError(400, `Datos inválidos: ${msg}`);
        checkUnique(key, patch, list, req.params.id);
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
        // Borrar un pendiente borra sus subtareas, un cuaderno sus cajitas y una mascota sus cuidados, como la app anterior.
        // Borrar una materia NO borra sus clases ni sus proyectos (tampoco en la app anterior).
        const child = LEGACY_CHILDREN[key];
        const also = child ? { [child.key]: rawList(doc, child.key).filter((s) => !s || s[child.field] !== req.params.id) } : undefined;
        return { list: list.filter((x) => idOf(x) !== req.params.id), result: null, also };
      });
      res.json({ ok: true, updatedAt: out.updatedAt });
    });
  }));

  // Claves que son un objeto (cycle, dayLog, budget). PUT exige el objeto
  // completo y PATCH solo lo que cambia; en ambos se conservan los campos
  // guardados que la API no conoce y el resto del documento.
  const saveObject = async (req: Request, res: Response, partial: boolean) => {
    const key = objectParam(req.params.key, res);
    if (!key) return;
    const input = parse(partial ? legacyObjectPatchSchemas[key] : legacyObjectSchemas[key], req.body, res) as Doc | null;
    if (!input) return;
    const out = await withDoc(req.userId as string, (doc) => {
      const before = doc[key];
      const value = { ...legacyObjectDefaults(key), ...(before && typeof before === 'object' && !Array.isArray(before) ? before : {}), ...input };
      return { set: { [key]: value }, result: value };
    });
    res.json({ value: out.result, updatedAt: out.updatedAt });
  };
  r.put('/modules/:key', requireAuth, ah((req, res) => saveObject(req, res, false)));
  r.patch('/modules/:key', requireAuth, ah((req, res) => saveObject(req, res, true)));

  return r;
}

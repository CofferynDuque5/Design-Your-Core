import { COUPLE_ITEMS_MAX, coupleCreateInput, coupleDataSchemas, pairKey, type CoupleItem, type CoupleKind } from '@dyc/core';
import { Router, type RequestHandler, type Request } from 'express';
import { newId, type Db } from '../db/db.js';
import type { User } from '../db/types.js';
import { ah } from '../lib/http.js';
import { parse } from '../v2/util.js';
import { findUser } from './auth.js';

interface Row {
  id: string;
  pairKey: string;
  kind: string;
  data: unknown;
  thumb: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const toItem = (r: Row, me: string): CoupleItem => ({
  id: r.id,
  kind: r.kind as CoupleKind,
  data: r.data as CoupleItem['data'],
  ...(r.thumb ? { thumb: r.thumb } : {}),
  byMe: r.createdBy === me,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const COLS = '"id", "pairKey", "kind", "data", "thumb", "createdBy", "createdAt", "updatedAt"';

/**
 * Espacio en pareja: lo que las dos personas vinculadas comparten. Cualquiera
 * de las dos puede añadir, cambiar o quitar; sin pareja vinculada no hay espacio.
 */
export function coupleRoutes({ db, requireAuth }: { db: Db; requireAuth: RequestHandler }): Router {
  const r = Router();

  /** La pareja de quien pide, con la clave común; null si no tiene. */
  const pair = async (req: Request): Promise<{ me: User; partner: User; key: string } | null> => {
    const me = await findUser(db, req.userId as string);
    if (!me?.partnerId) return null;
    const partner = await findUser(db, me.partnerId);
    if (!partner || partner.partnerId !== me.id) return null;
    return { me, partner, key: pairKey(me.id, partner.id) };
  };
  const noPartner = { error: 'Vincúlate con tu pareja en Perfil para usar el espacio compartido.' };

  r.get('/couple', requireAuth, ah(async (req, res) => {
    const p = await pair(req);
    if (!p) return res.json({ partner: null, items: [] });
    const rows = await db.rows<Row>(`SELECT ${COLS} FROM "CoupleItem" WHERE "pairKey" = $1 ORDER BY "createdAt" DESC LIMIT ${COUPLE_ITEMS_MAX}`, [p.key]);
    res.json({ partner: { name: p.partner.name }, items: rows.map((x) => toItem(x, p.me.id)) });
  }));

  r.post('/couple/items', requireAuth, ah(async (req, res) => {
    const p = await pair(req);
    if (!p) return res.status(409).json(noPartner);
    const input = parse(coupleCreateInput, req.body, res);
    if (!input) return;
    const count = await db.row<{ n: string }>('SELECT count(*) AS n FROM "CoupleItem" WHERE "pairKey" = $1', [p.key]);
    if (Number(count?.n ?? 0) >= COUPLE_ITEMS_MAX) return res.status(409).json({ error: `El espacio compartido llegó a ${COUPLE_ITEMS_MAX} elementos. Borra alguno para añadir más.` });
    const photo = input.kind === 'foto' ? input : null;
    const row = await db.row<Row>(
      `INSERT INTO "CoupleItem" ("id", "pairKey", "kind", "data", "image", "thumb", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLS}`,
      [newId(), p.key, input.kind, JSON.stringify(input.data), photo?.image ?? null, photo?.thumb ?? null, p.me.id],
    );
    res.status(201).json({ item: toItem(row as Row, p.me.id) });
  }));

  r.patch('/couple/items/:id', requireAuth, ah(async (req, res) => {
    const p = await pair(req);
    if (!p) return res.status(409).json(noPartner);
    const cur = await db.row<Row>(`SELECT ${COLS} FROM "CoupleItem" WHERE "id" = $1 AND "pairKey" = $2`, [req.params.id, p.key]);
    if (!cur) return res.status(404).json({ error: 'Ya no existe. Puede que tu pareja lo haya borrado.' });
    const schema = coupleDataSchemas[cur.kind as CoupleKind];
    if (!schema) return res.status(400).json({ error: 'Tipo no válido' });
    const data = parse(schema, { ...(cur.data as object), ...(req.body?.data ?? {}) }, res);
    if (!data) return;
    const row = await db.row<Row>(`UPDATE "CoupleItem" SET "data" = $2, "updatedAt" = now() WHERE "id" = $1 RETURNING ${COLS}`, [cur.id, JSON.stringify(data)]);
    res.json({ item: toItem(row as Row, p.me.id) });
  }));

  r.delete('/couple/items/:id', requireAuth, ah(async (req, res) => {
    const p = await pair(req);
    if (!p) return res.status(409).json(noPartner);
    const done = await db.row('DELETE FROM "CoupleItem" WHERE "id" = $1 AND "pairKey" = $2 RETURNING "id"', [req.params.id, p.key]);
    if (!done) return res.status(404).json({ error: 'Ya no existe.' });
    res.json({ ok: true });
  }));

  /** La foto completa (aparte, porque pesa). */
  r.get('/couple/items/:id/image', requireAuth, ah(async (req, res) => {
    const p = await pair(req);
    if (!p) return res.status(409).json(noPartner);
    const row = await db.row<{ image: string | null }>('SELECT "image" FROM "CoupleItem" WHERE "id" = $1 AND "pairKey" = $2', [req.params.id, p.key]);
    if (!row?.image) return res.status(404).json({ error: 'No hay foto' });
    res.json({ image: row.image });
  }));

  return r;
}

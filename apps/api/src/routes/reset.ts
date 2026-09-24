import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import express, { Router, type RequestHandler, type Response } from 'express';
import { ah } from '../lib/http.js';
import { escapeHtml, sha256hex } from '../lib/security.js';

// CSP permisiva SOLO para las páginas HTML de restablecimiento (autocontenidas).
const resetPageCsp = (res: Response) =>
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");

function resetPage(token: string, error?: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Restablecer contraseña · Core</title><style>
  body{font-family:system-ui,sans-serif;background:#0b0d11;color:#e7eae7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px}
  .card{background:#151a18;border:1px solid #26302b;border-radius:20px;padding:28px;max-width:380px;width:100%}
  h1{font-size:20px;margin:0 0 4px;color:#22C77E}.sub{color:#9aa39d;font-size:13px;margin:0 0 18px}
  label{font-size:12px;color:#9aa39d;font-weight:600}
  input{width:100%;box-sizing:border-box;height:46px;border-radius:12px;border:1px solid #26302b;background:#0f1512;color:#e7eae7;padding:0 14px;font-size:15px;margin:6px 0 14px;outline:none}
  button{width:100%;height:48px;border:0;border-radius:13px;background:linear-gradient(150deg,#22C77E,#0FA968);color:#fff;font-size:15px;font-weight:700;cursor:pointer}
  .err{background:#3a1d1d;border:1px solid #E5484D;color:#ffb4b4;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:14px}
  </style></head><body><form class="card" method="POST" action="/reset">
  <h1>◉ Core</h1><p class="sub">Elige una nueva contraseña.</p>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <label>Nueva contraseña (mínimo 8)</label>
  <input type="password" name="next" minlength="8" required autocomplete="new-password" placeholder="••••••••">
  <button type="submit">Guardar contraseña</button>
  </form></body></html>`;
}

function resultPage(ok: boolean, msg: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Core</title><style>
  body{font-family:system-ui,sans-serif;background:#0b0d11;color:#e7eae7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px;text-align:center}
  .card{background:#151a18;border:1px solid #26302b;border-radius:20px;padding:32px;max-width:380px}
  h1{font-size:40px;margin:0 0 8px}p{color:#c7cdc9;font-size:15px;line-height:1.5}
  </style></head><body><div class="card"><h1>${ok ? '✅' : '⚠️'}</h1><p>${escapeHtml(msg)}</p></div></body></html>`;
}

export function resetRoutes({ prisma, strict }: { prisma: PrismaClient; strict: RequestHandler }): Router {
  const r = Router();

  r.get('/reset', (req, res) => {
    resetPageCsp(res);
    const token = String(req.query.token || '');
    if (!token) {
      res.status(400).send(resultPage(false, 'Enlace inválido.'));
      return;
    }
    res.send(resetPage(token));
  });

  r.post('/reset', express.urlencoded({ extended: false }), strict, ah(async (req, res) => {
    resetPageCsp(res);
    const token = String(req.body?.token || '');
    const next = String(req.body?.next || '');
    if (next.length < 8) {
      res.status(400).send(resetPage(token, 'La contraseña debe tener al menos 8 caracteres.'));
      return;
    }
    const user = token ? await prisma.user.findUnique({ where: { resetTokenHash: sha256hex(token) } }) : null;
    if (!user || !user.resetExpires || user.resetExpires.getTime() < Date.now()) {
      res.status(400).send(resultPage(false, 'El enlace no es válido o ya caducó. Pide uno nuevo desde la app.'));
      return;
    }
    const passwordHash = await bcrypt.hash(next, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 }, resetTokenHash: null, resetExpires: null },
    });
    res.send(resultPage(true, 'Tu contraseña se cambió correctamente. Ya puedes volver a la app e iniciar sesión.'));
  }));

  return r;
}

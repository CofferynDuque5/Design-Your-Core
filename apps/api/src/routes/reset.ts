import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express, { Router, type RequestHandler, type Response } from 'express';
import type { Db } from '../db/db.js';
import type { User } from '../db/types.js';
import { ah } from '../lib/http.js';
import { escapeHtml, sha256hex, strongPassword, WEAK_PASSWORD } from '../lib/security.js';

// Páginas HTML autocontenidas para elegir una contraseña nueva desde el enlace del
// correo. Mismo aspecto que la app (negro y lima, iconos de línea, sin emojis).
// El único script (mostrar la contraseña y marcar los requisitos al escribir) va
// permitido por su hash en la CSP; sin él, el formulario funciona igual.

const STYLE = `
:root{color-scheme:dark;--bg:#0A0B09;--surface:#121410;--line:#23261F;--line-strong:#363A30;--fg:#EEF0E8;--muted:#A3A89A;--lime:#C8F23A;--on-lime:#10120C;--ok:#C8F23A;--bad:#FF8A6B}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--fg);font:400 16px/1.5 Figtree,"Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
.card{width:100%;max-width:400px;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:28px;display:grid;gap:18px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600}
h1{margin:0;font:500 1.6rem/1.2 Newsreader,"Iowan Old Style",Georgia,serif}
p{margin:0;color:var(--muted)}
label{font-size:14px;font-weight:600;color:var(--fg)}
.field{display:grid;gap:8px}
.input{position:relative;display:flex}
input[type=password],input[type=text]{width:100%;height:48px;border-radius:12px;border:1px solid var(--line-strong);background:var(--bg);color:var(--fg);padding:0 48px 0 14px;font:inherit}
input:focus-visible,button:focus-visible{outline:2px solid var(--lime);outline-offset:2px}
.eye{position:absolute;right:4px;top:4px;width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:var(--muted);cursor:pointer;display:grid;place-items:center}
.eye[hidden]{display:none}
.rules{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:14px;color:var(--muted)}
.rules li{display:flex;align-items:center;gap:8px}
.rules li[data-ok=true]{color:var(--fg)}
.rules li[data-ok=true] .dot{background:var(--ok);border-color:var(--ok)}
.dot{width:10px;height:10px;border-radius:50%;border:2px solid var(--muted);flex:none}
.submit{height:48px;border:0;border-radius:12px;background:var(--lime);color:var(--on-lime);font-family:inherit;font-size:16px;font-weight:600;cursor:pointer}
.error{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--bad);border-radius:12px;padding:12px;color:var(--fg);font-size:14px}
.error svg{color:var(--bad);flex:none}
.result{justify-items:start}
.result svg{color:var(--lime)}
.result.bad svg{color:var(--bad)}
`;

const LOGO = `<svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#C8F23A"/><g transform="translate(32 32) scale(0.8) translate(-33 -33.5)"><ellipse cx="32" cy="53" rx="10" ry="3" fill="#10120C" opacity="0.45"/><path d="M32 50 V30" fill="none" stroke="#10120C" stroke-width="4.5" stroke-linecap="round"/><path d="M31 41 C23 41 16 35.5 15 26 C24 26 30.5 31.5 31 41 Z" fill="#10120C"/><path d="M33 32 C33 21.5 40.5 13 51 11.5 C51 23 43.5 31 33 32 Z" fill="#10120C"/></g></svg>`;
const icon = (paths: string, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ALERT = icon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>');
const CHECK = icon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', 40);
const BAD = icon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 40);
const EYE = icon('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>');

const RULES: Array<[string, string]> = [
  ['length', 'Mínimo 8 caracteres'],
  ['upper', 'Una letra mayúscula (A-Z)'],
  ['lower', 'Una letra minúscula (a-z)'],
  ['number', 'Un número (0-9)'],
];

// Marca cada requisito al escribir y muestra u oculta la contraseña.
const SCRIPT = `(function(){var i=document.getElementById('next'),b=document.getElementById('eye');if(!i)return;var t={length:function(p){return Array.from(p).length>=8},upper:function(p){return /\\p{Lu}/u.test(p)},lower:function(p){return /\\p{Ll}/u.test(p)},number:function(p){return /\\p{Nd}/u.test(p)}};function u(){document.querySelectorAll('[data-rule]').forEach(function(li){var ok=t[li.getAttribute('data-rule')](i.value);li.setAttribute('data-ok',ok);li.querySelector('.sr').textContent=ok?': cumplido':': pendiente'})}i.addEventListener('input',u);u();b.hidden=false;b.addEventListener('click',function(){var s=i.type==='password';i.type=s?'text':'password';b.setAttribute('aria-pressed',s);b.setAttribute('aria-label',s?'Ocultar contraseña':'Mostrar contraseña')})})();`;
const SCRIPT_HASH = `'sha256-${crypto.createHash('sha256').update(SCRIPT).digest('base64')}'`;

const resetPageCsp = (res: Response) =>
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'unsafe-inline'; script-src ${SCRIPT_HASH}; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  );

const page = (title: string, body: string) =>
  `<!doctype html><html lang="es" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#0A0B09"><title>${title} · Design Your Core</title><style>${STYLE}</style></head><body>${body}</body></html>`;

const VISUALLY_HIDDEN = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';

function resetPage(token: string, error?: string): string {
  const rules = RULES.map(([id, label]) => `<li data-rule="${id}" data-ok="false"><span class="dot"></span>${label}<span class="sr" style="${VISUALLY_HIDDEN}"></span></li>`).join('');
  return page(
    'Nueva contraseña',
    `<form class="card" method="POST" action="/reset" novalidate>
  <div class="brand">${LOGO}<span>Design Your Core</span></div>
  <div style="display:grid;gap:6px"><h1>Elige una contraseña nueva</h1><p>Después podrás entrar con ella en la app.</p></div>
  ${error ? `<div class="error" role="alert">${ALERT}<span>${escapeHtml(error)}</span></div>` : ''}
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <div class="field">
    <label for="next">Contraseña nueva</label>
    <div class="input"><input id="next" type="password" name="next" required autocomplete="new-password" aria-describedby="rules"${error ? ' aria-invalid="true" autofocus' : ''}>
    <button class="eye" id="eye" type="button" aria-label="Mostrar contraseña" aria-pressed="false" hidden>${EYE}</button></div>
    <ul class="rules" id="rules" aria-label="Requisitos de la contraseña">${rules}</ul>
  </div>
  <button class="submit" type="submit">Guardar contraseña</button>
</form><script>${SCRIPT}</script>`,
  );
}

function resultPage(ok: boolean, msg: string): string {
  return page(
    ok ? 'Contraseña cambiada' : 'Enlace no válido',
    `<main class="card result${ok ? '' : ' bad'}">
  <div class="brand">${LOGO}<span>Design Your Core</span></div>
  ${ok ? CHECK : BAD}
  <h1>${ok ? 'Contraseña cambiada' : 'No se pudo cambiar'}</h1>
  <p>${escapeHtml(msg)}</p>
</main>`,
  );
}

export function resetRoutes({ db, strict }: { db: Db; strict: RequestHandler }): Router {
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
    if (!strongPassword(next)) {
      res.status(400).send(resetPage(token, WEAK_PASSWORD));
      return;
    }
    const user = token ? await db.row<User>('SELECT * FROM "User" WHERE "resetTokenHash" = $1', [sha256hex(token)]) : null;
    if (!user || !user.resetExpires || user.resetExpires.getTime() < Date.now()) {
      res.status(400).send(resultPage(false, 'El enlace no es válido o ya caducó. Pide uno nuevo desde la app.'));
      return;
    }
    const passwordHash = await bcrypt.hash(next, 12);
    await db.exec(
      'UPDATE "User" SET "passwordHash" = $2, "tokenVersion" = "tokenVersion" + 1, "resetTokenHash" = NULL, "resetExpires" = NULL WHERE "id" = $1',
      [user.id, passwordHash],
    );
    res.send(resultPage(true, 'Tu contraseña se cambió correctamente. Ya puedes volver a la app e iniciar sesión.'));
  }));

  return r;
}

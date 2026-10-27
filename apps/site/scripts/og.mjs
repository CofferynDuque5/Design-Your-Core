// Genera public/og.png (1200×630), la imagen que se ve al compartir el enlace.
// Uso: pnpm --filter @dyc/site og   (usa el Chromium de Playwright)
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const font = (p) => readFile(require.resolve(p)).then((b) => b.toString('base64'));
const [serif, sans] = await Promise.all([font('@fontsource/newsreader/files/newsreader-latin-400-italic.woff2'), font('@fontsource/figtree/files/figtree-latin-500-normal.woff2')]);

const pillars = [
  ['Movimiento', '#D3754F'],
  ['Descanso', '#4B7CBA'],
  ['Alimentación', '#44A781'],
  ['Enfoque', '#BC8C30'],
  ['Pareja', '#D1748F'],
  ['Propósito', '#7A5DA9'],
];

const html = `<!doctype html><html><head><style>
@font-face { font-family: N; src: url(data:font/woff2;base64,${serif}); }
@font-face { font-family: F; src: url(data:font/woff2;base64,${sans}); }
body { margin: 0; width: 1200px; height: 630px; background: #0A0B09; color: #ECE8E1; font-family: F; display: flex; flex-direction: column; justify-content: space-between; padding: 72px 80px; box-sizing: border-box; }
.brand { display: flex; align-items: center; gap: 16px; font-size: 26px; letter-spacing: .01em; }
h1 em { color: #C8F23A; }
h1 { font-family: N; font-style: italic; font-weight: 400; font-size: 96px; line-height: 1.05; margin: 0; max-width: 760px; letter-spacing: -0.02em; }
ul { display: flex; gap: 12px; list-style: none; margin: 0; padding: 0; }
li { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border: 1px solid rgba(236,232,225,.22); border-radius: 999px; font-size: 22px; }
i { width: 12px; height: 12px; border-radius: 50%; display: block; }
</style></head><body>
<div class="brand"><svg viewBox="0 0 64 64" width="44" height="44"><rect width="64" height="64" rx="14" fill="#C8F23A"/><g transform="translate(32 32) scale(0.8) translate(-33 -33.5)"><ellipse cx="32" cy="53" rx="10" ry="3" fill="#10120C" opacity="0.45"/><path d="M32 50 V30" fill="none" stroke="#10120C" stroke-width="4.5" stroke-linecap="round"/><path d="M31 41 C23 41 16 35.5 15 26 C24 26 30.5 31.5 31 41 Z" fill="#10120C"/><path d="M33 32 C33 21.5 40.5 13 51 11.5 C51 23 43.5 31 33 32 Z" fill="#10120C"/></g></svg>Design Your Core</div>
<h1>Diseña tu forma de <em>estar bien</em>.</h1>
<ul>${pillars.map(([n, c]) => `<li><i style="background:${c}"></i>${n}</li>`).join('')}</ul>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await writeFile('public/og.png', await page.screenshot());
await browser.close();
console.log('→ public/og.png');

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
  ['Relaciones', '#D1748F'],
  ['Propósito', '#7A5DA9'],
];

const html = `<!doctype html><html><head><style>
@font-face { font-family: N; src: url(data:font/woff2;base64,${serif}); }
@font-face { font-family: F; src: url(data:font/woff2;base64,${sans}); }
body { margin: 0; width: 1200px; height: 630px; background: #1E3A5F; color: #F4F3EF; font-family: F; display: flex; flex-direction: column; justify-content: space-between; padding: 72px 80px; box-sizing: border-box; }
.brand { display: flex; align-items: center; gap: 16px; font-size: 26px; letter-spacing: .01em; }
h1 { font-family: N; font-style: italic; font-weight: 400; font-size: 96px; line-height: 1.05; margin: 0; max-width: 760px; letter-spacing: -0.02em; }
ul { display: flex; gap: 12px; list-style: none; margin: 0; padding: 0; }
li { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border: 1px solid rgba(244,243,239,.3); border-radius: 999px; font-size: 22px; }
i { width: 12px; height: 12px; border-radius: 50%; display: block; }
</style></head><body>
<div class="brand"><svg viewBox="0 0 64 64" width="44" height="44"><circle cx="32" cy="32" r="17" fill="none" stroke="#F1EADC" stroke-width="4"/><circle cx="32" cy="32" r="6" fill="#C9B28C"/></svg>Design Your Core</div>
<h1>Diseña tu forma de estar bien.</h1>
<ul>${pillars.map(([n, c]) => `<li><i style="background:${c}"></i>${n}</li>`).join('')}</ul>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await writeFile('public/og.png', await page.screenshot());
await browser.close();
console.log('→ public/og.png');

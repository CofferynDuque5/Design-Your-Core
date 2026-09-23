// Genera los iconos PNG de la PWA a partir del logotipo (usa el Chromium de Playwright).
// Uso: pnpm --filter @dyc/web icons
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const mark = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${pad ? 0 : 14}" fill="#1E3A5F"/>
  <g transform="translate(32 32) scale(${pad ? 0.72 : 1}) translate(-32 -32)">
    <circle cx="32" cy="32" r="17" fill="none" stroke="#F1EADC" stroke-width="4"/>
    <circle cx="32" cy="32" r="6" fill="#C9B28C"/>
  </g>
</svg>`;

const out = [
  ['public/icon-192.png', 192, false],
  ['public/icon-512.png', 512, false],
  ['public/icon-maskable-512.png', 512, true],
  ['public/apple-touch-icon.png', 180, true],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [file, size, pad] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${mark(size, pad)}</body>`);
  await writeFile(file, await page.screenshot({ omitBackground: true }));
  console.log('→', file);
}
await browser.close();

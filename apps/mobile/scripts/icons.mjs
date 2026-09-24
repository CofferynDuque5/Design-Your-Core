// Genera los iconos y la pantalla de carga de la app a partir del logotipo.
// Usa el Chromium de Playwright de @dyc/web: pnpm --filter @dyc/mobile icons
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const PRIMARY = '#1E3A5F';
// ring: el círculo; bg: fondo (null = transparente); scale: tamaño de la marca dentro del lienzo.
const mark = (size, { bg = PRIMARY, scale = 1, ring = '#F1EADC', dot = '#C9B28C' } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  ${bg ? `<rect width="64" height="64" fill="${bg}"/>` : ''}
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <circle cx="32" cy="32" r="17" fill="none" stroke="${ring}" stroke-width="4"/>
    <circle cx="32" cy="32" r="6" fill="${dot}"/>
  </g>
</svg>`;

const out = [
  // iOS recorta las esquinas solo: el icono va a sangre.
  ['assets/icon.png', 1024, {}],
  // Android: primer plano dentro de la zona segura (66 %) sobre fondo del color primario.
  ['assets/adaptive-icon.png', 1024, { bg: null, scale: 0.62 }],
  ['assets/adaptive-icon-monochrome.png', 1024, { bg: null, scale: 0.62, ring: '#000', dot: '#000' }],
  ['assets/splash-icon.png', 512, { bg: null, scale: 0.9 }],
  ['assets/favicon.png', 48, {}],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [file, size, opts] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${mark(size, opts)}</body>`);
  await writeFile(file, await page.screenshot({ omitBackground: true }));
  console.log('→', file);
}
await browser.close();

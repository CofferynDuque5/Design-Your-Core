// Genera la guía visual del sistema de diseño (docs/design-system/index.html)
// a partir de la plantilla y de los tokens, para que nunca se desincronicen.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { contrast } from '../src/contrast.js';
import { buildCss } from '../src/css.js';
import { color, font, fontSize, lineHeight, pillars, radius, space, type ColorScheme } from '../src/tokens.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const docsDir = `${root}docs/design-system/`;
const template = readFileSync(`${docsDir}template.html`, 'utf8');
const componentsCss = readFileSync(fileURLToPath(new URL('../css/components.css', import.meta.url)), 'utf8');

// Iconos de Lucide (licencia ISC) usados por cada pilar.
const ICONS: Record<string, string> = {
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
};

const indent = (html: string, n = 6) =>
  html
    .split('\n')
    .map((l) => (l ? ' '.repeat(n) + l : l))
    .join('\n');

const pillarCards = pillars
  .map(
    (p) => `<article class="card pillar-card" data-pillar="${p.id}">
  <span class="pillar-card__icon"><svg class="icon icon--lg" viewBox="0 0 24 24" aria-hidden="true">${ICONS[p.icon]}</svg></span>
  <h3>${p.name}</h3>
  <p>${p.description}</p>
  <div class="pillar-card__swatches">
    <span class="mini-swatch"><i style="--c: var(--pillar-${p.id})"></i>Texto</span>
    <span class="mini-swatch"><i style="--c: var(--pillar-${p.id}-chart)"></i>Gráfico</span>
    <span class="mini-swatch"><i style="--c: var(--pillar-${p.id}-soft)"></i>Fondo</span>
  </div>
</article>`,
  )
  .join('\n');

// Semana de ejemplo: puntuación 0–100 por pilar y variación frente a la anterior.
const week: Record<string, [number, number]> = {
  movimiento: [72, 8],
  descanso: [64, 5],
  alimentacion: [58, -4],
  enfoque: [81, 12],
  relaciones: [45, 0],
  proposito: [69, 3],
};
const weekHtml = `<ul class="week" aria-label="Puntuación semanal por pilar, de 0 a 100">
${pillars
  .map((p) => {
    const [v, d] = week[p.id];
    const cls = d > 0 ? 'delta--up' : d < 0 ? 'delta--down' : 'muted';
    const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
    return `  <li data-pillar="${p.id}" title="${p.name}: ${v} de 100 (${sign}${Math.abs(d)} frente a la semana anterior)">
    <span class="week__name">${p.short}</span>
    <span class="week__bar"><span style="--v: ${v}"></span></span>
    <span class="week__value">${v}</span>
    <span class="week__delta ${cls}">${sign}${Math.abs(d)}</span>
  </li>`;
  })
  .join('\n')}
</ul>
<div class="week-axis" aria-hidden="true"><span></span><div><span>0</span><span>50</span><span>100</span></div><span></span><span>vs. anterior</span></div>`;

type Key = keyof ColorScheme;
const groups: Array<[string, Array<[Key, string]>]> = [
  ['Neutros', [['bg', 'Fondo'], ['surface', 'Tarjeta'], ['surfaceSunken', 'Hundida'], ['line', 'Línea'], ['inkSubtle', 'Texto terciario'], ['inkMuted', 'Texto secundario'], ['ink', 'Texto']]],
  ['Acentos', [['primary', 'Azul profundo'], ['primarySoft', 'Azul suave'], ['sage', 'Salvia'], ['sand', 'Arena'], ['terracotta', 'Terracota']]],
  ['Estados', [['success', 'Éxito'], ['warning', 'Aviso'], ['danger', 'Error'], ['focus', 'Foco']]],
];
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const ratio = (fg: string, bg: string) => `${contrast(fg, bg).toFixed(1)}:1`;
const swatches = groups
  .map(
    ([title, keys]) => `<div class="stack">
  <span class="sub">${title}</span>
  <div class="swatches">
${keys
  .map(
    ([k, label]) => `    <div class="swatch"><span class="swatch__chip" style="--c: var(--color-${kebab(k)})"></span><span class="swatch__meta"><b>${label}</b><span>--color-${kebab(k)}</span><span>Claro ${color.light[k]} · ${ratio(color.light[k], color.light.surface)}</span><span>Oscuro ${color.dark[k]} · ${ratio(color.dark[k], color.dark.surface)}</span></span></div>`,
  )
  .join('\n')}
  </div>
</div>`,
  )
  .join('\n');

const typeRows: Array<[keyof typeof fontSize, string, string, number]> = [
  ['display', 'display', 'Una versión más equilibrada de ti', lineHeight.tight],
  ['h1', 'display', 'Tu semana, en seis pilares', lineHeight.tight],
  ['h2', 'display', 'Descanso que se nota', lineHeight.snug],
  ['h3', 'display', 'Buenas tardes, Nathan', lineHeight.snug],
  ['title', 'sans', 'Retos de hoy', lineHeight.snug],
  ['lead', 'sans', 'Pequeños cambios, sostenidos en el tiempo, construyen el equilibrio que buscas.', lineHeight.relaxed],
  ['body', 'sans', 'Anota cómo dormiste y a qué hora te levantaste. Con tres noches registradas verás tu ritmo.', lineHeight.normal],
  ['small', 'sans', 'Basado en tus check-ins de las últimas dos semanas.', lineHeight.normal],
  ['caption', 'sans', 'ACTUALIZADO HACE 2 MIN', lineHeight.normal],
];
const typeHtml = typeRows
  .map(([k, fam, text, lh]) => {
    const style = `font-family: var(--font-${fam}); font-size: var(--text-${k}); line-height: ${lh};${fam === 'display' ? ' letter-spacing: var(--tracking-display);' : ''}${k === 'title' ? ' font-weight: 600;' : ''}${k === 'caption' ? ' letter-spacing: var(--tracking-label); font-weight: 600;' : ''}`;
    const face = fam === 'display' ? font.native.display : font.native.sans;
    return `<div class="type-row"><span class="type-row__meta"><b>${k}</b>${fontSize[k]} px · ${face}</span><span style="${style}">${text}</span></div>`;
  })
  .join('\n');

const spaceHtml = `<div class="space-scale">
${Object.entries(space)
  .filter(([, v]) => v > 0)
  .map(([k, v]) => `  <div><span>${k} · ${v}px</span><i style="--w: ${v}px"></i></div>`)
  .join('\n')}
</div>`;
const radiiHtml = `<div class="radii">
${Object.entries(radius)
  .map(([k, v]) => `  <div><i style="--r: ${v}px"></i><span>${k} · ${v === 999 ? 'píldora' : `${v}px`}</span></div>`)
  .join('\n')}
</div>`;

const out = template
  .replace(/<!-- Plantilla[^\n]*\n/, '<!-- Generado por `pnpm --filter @dyc/tokens docs`. Edita template.html o los tokens, no este archivo. -->\n')
  .replace('/*@TOKENS*/', buildCss())
  .replace('/*@COMPONENTS*/', componentsCss)
  .replace('<!--@PILLARS-->', indent(pillarCards))
  .replace('<!--@WEEK-->', indent(weekHtml))
  .replace('<!--@SWATCHES-->', indent(swatches, 4))
  .replace('<!--@TYPE-->', indent(typeHtml))
  .replace('<!--@SPACE-->', indent(spaceHtml, 8))
  .replace('<!--@RADII-->', indent(radiiHtml, 8));

if (/<!--@|\/\*@/.test(out)) throw new Error('Quedó un marcador sin reemplazar en la plantilla');
writeFileSync(`${docsDir}index.html`, out);
console.log('docs/design-system/index.html generado');

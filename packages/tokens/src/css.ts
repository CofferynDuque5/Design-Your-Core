import { breakpoint, color, font, fontSize, fontWeight, letterSpacing, lineHeight, motion, pillars, radius, shadow, space, type ThemeName } from './tokens.js';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const px = (n: number) => (n === 0 ? '0' : `${n}px`);

function themeVars(theme: ThemeName): string[] {
  const lines = Object.entries(color[theme]).map(([k, v]) => `--color-${kebab(k)}: ${v};`);
  for (const p of pillars) {
    lines.push(`--pillar-${p.id}: ${p.color[theme]};`);
    lines.push(`--pillar-${p.id}-soft: ${p.soft[theme]};`);
    lines.push(`--pillar-${p.id}-chart: ${p.chart[theme]};`);
  }
  for (const [k, v] of Object.entries(shadow[theme])) lines.push(`--shadow-${k}: ${v};`);
  return lines;
}

function staticVars(): string[] {
  const lines = [`--font-display: ${font.display};`, `--font-sans: ${font.sans};`];
  for (const [k, v] of Object.entries(fontSize)) lines.push(`--text-${k}: ${v / 16}rem;`);
  for (const [k, v] of Object.entries(fontWeight)) lines.push(`--weight-${k}: ${v};`);
  for (const [k, v] of Object.entries(lineHeight)) lines.push(`--leading-${k}: ${v};`);
  for (const [k, v] of Object.entries(letterSpacing)) lines.push(`--tracking-${k}: ${v};`);
  for (const [k, v] of Object.entries(space)) lines.push(`--space-${k}: ${px(v)};`);
  for (const [k, v] of Object.entries(radius)) lines.push(`--radius-${k}: ${px(v)};`);
  for (const [k, v] of Object.entries(motion.duration)) lines.push(`--duration-${k}: ${v}ms;`);
  for (const [k, v] of Object.entries(motion.easing)) lines.push(`--ease-${k}: ${v};`);
  for (const [k, v] of Object.entries(breakpoint)) lines.push(`--breakpoint-${k}: ${v}px;`);
  return lines;
}

const block = (selector: string, lines: string[]) => `${selector} {\n${lines.map((l) => `  ${l}`).join('\n')}\n}`;

/**
 * Genera las variables CSS. Tema claro en :root; el oscuro se aplica con la
 * preferencia del sistema (salvo que la persona elija claro) o con
 * data-theme="dark" en <html>, que tiene prioridad en ambos sentidos.
 */
export function buildCss(): string {
  const dark = themeVars('dark');
  return [
    '/* Generado por @dyc/tokens a partir de src/tokens.ts. No editar a mano. */',
    block(':root', ['color-scheme: light;', ...staticVars(), ...themeVars('light')]),
    `@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme="light"])', ['color-scheme: dark;', ...dark])
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n')}\n}`,
    block(':root[data-theme="dark"]', ['color-scheme: dark;', ...dark]),
    '',
  ].join('\n\n');
}

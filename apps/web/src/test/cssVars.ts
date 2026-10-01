import { color, pillars, type ThemeName } from '@dyc/tokens';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Lectura de los CSS de estilos y paletas para las pruebas de contraste: variables
// de un bloque y colores compuestos, sin navegador.

export type Vars = Record<string, string>;

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Archivo relativo a src/ (p. ej. `styles/paletas.css` o `../index.html`). */
export const srcFile = (path: string) => readFileSync(join(SRC, path), 'utf8');

/** Variables del primer bloque `selector { … }` a partir de `from`. */
export function block(css: string, selector: string, from = 0): Vars {
  const start = css.indexOf(`${selector} {`, from);
  if (start < 0) throw new Error(`No está el bloque ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** Tokens de @dyc/tokens (tema claro u oscuro) como variables CSS. */
export function baseVars(theme: ThemeName): Vars {
  const vars: Vars = {};
  for (const [k, v] of Object.entries(color[theme])) vars[`--color-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = v;
  for (const p of pillars) {
    vars[`--pillar-${p.id}`] = p.color[theme];
    vars[`--pillar-${p.id}-soft`] = p.soft[theme];
    vars[`--pillar-${p.id}-chart`] = p.chart[theme];
  }
  return vars;
}

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
function rgb(value: string): [number, number, number, number] {
  const h = /^#([0-9a-f]{6})$/i.exec(value);
  if (h) {
    const n = parseInt(h[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(value);
  if (!m) throw new Error(`Color no reconocido: ${value}`);
  return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
}

/** Color translúcido `top` sobre el opaco `under`, como hex. */
export function over(top: string, under: string): string {
  const [r, g, b, a] = rgb(top);
  const [r2, g2, b2] = rgb(under);
  return `#${hex(r * a + r2 * (1 - a))}${hex(g * a + g2 * (1 - a))}${hex(b * a + b2 * (1 - a))}`;
}

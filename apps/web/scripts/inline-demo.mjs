// Junta la versión de prueba en un solo HTML (ver docs/demo.md): mete el JS y el
// CSS que generó `vite build --mode demo` dentro de index.html. Lo externo que
// queda son las fuentes de Google Fonts; cualquier otro archivo hace fallar el paso.
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'dist-demo', 'build');
const out = join(root, 'dist-demo', 'design-your-core-demo.html');

let html = readFileSync(join(build, 'index.html'), 'utf8');
const local = (url) => !/^(https?:|data:|#)/.test(url);
const read = (url) => readFileSync(join(build, url.replace(/^\.?\//, '')), 'utf8');

// Dentro de <script> no puede aparecer «</script» ni abrirse un comentario HTML.
const safeJs = (js) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const safeCss = (css) => css.replace(/<\/(style)/gi, '<\\/$1');

// Primero se cambian por marcas, para comprobar el esqueleto sin el código dentro.
const parts = [];
const mark = (text) => `\u0000${parts.push(text) - 1}\u0000`;
let css = '';
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (tag, src) =>
  local(src) ? mark(`<script type="module">${safeJs(read(src))}</script>`) : tag,
);
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (tag, href) => {
  if (!local(href)) return tag;
  css += read(href);
  return mark(`<style>${safeCss(read(href))}</style>`);
});

// Nada local debe quedar referenciado (imágenes, fuentes, trozos de JS…).
const leftovers = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter(local);
const cssUrls = [...css.matchAll(/url\((["']?)([^)"']+)\1\)/g)].map((m) => m[2]).filter(local);
if (leftovers.length || cssUrls.length || !parts.length) {
  console.error('Quedan archivos sin incrustar (o no hay nada que incrustar):', [...leftovers, ...cssUrls]);
  process.exit(1);
}
html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[Number(i)]);

writeFileSync(out, html);
rmSync(build, { recursive: true, force: true });
const mb = (statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`Versión de prueba: ${out} (${mb} MB)`);

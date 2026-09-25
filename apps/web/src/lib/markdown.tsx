import { Fragment, type ReactNode } from 'react';

/**
 * Markdown mínimo y SEGURO para las notas y las respuestas del Asistente.
 * Todo se convierte en elementos de React (el texto siempre va escapado):
 * nunca se inserta HTML. Admite títulos, párrafos, negrita, cursiva, tachado,
 * código (en línea y en bloque), citas, listas, casillas, enlaces http(s) y
 * mailto, separadores, fórmulas `$…$` / `$$…$$` (en monoespaciado, sin
 * KaTeX) e imágenes `coreimg:<id>` o incrustadas en base64. Las imágenes de
 * otras webs se muestran como enlace para no cargar nada de terceros.
 */

/**
 * Devuelve la dirección de una imagen de la nota: el texto a usar en `src`,
 * `null` si no está disponible o `undefined` mientras se carga.
 */
export type ImageResolver = (ref: string) => string | null | undefined;

const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i;
const SAFE_LINK = /^(?:https?:\/\/|mailto:)/i;

/** Por defecto solo se muestran las imágenes incrustadas; `coreimg:` necesita quien las cargue. */
const defaultResolver: ImageResolver = (ref) => (DATA_IMAGE.test(ref) ? ref : null);

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'math'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: Array<{ text: string; task: boolean | null }> }
  | { type: 'rule' };

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+([\s\S]*)$/;

const startsBlock = (line: string) => FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || BULLET.test(line) || ORDERED.test(line) || line.trim() === '$$';

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // cierre (o fin del texto)
      blocks.push({ type: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }
    const oneLineMath = /^\s*\$\$(.+)\$\$\s*$/.exec(line);
    if (oneLineMath) {
      blocks.push({ type: 'math', text: oneLineMath[1].trim() });
      i++;
      continue;
    }
    if (line.trim() === '$$') {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '$$') body.push(lines[i++]);
      i++;
      blocks.push({ type: 'math', text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push((QUOTE.exec(lines[i++]) as RegExpExecArray)[1]);
      blocks.push({ type: 'quote', text: body.join('\n') });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = !bullet;
      const marker = isOrdered ? ORDERED : BULLET;
      const items: Array<{ text: string; task: boolean | null }> = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = marker.exec(l);
        if (m) {
          const text = isOrdered ? m[2] : m[1];
          const task = TASK.exec(text);
          items.push(task ? { text: task[2], task: task[1] !== ' ' } : { text, task: null });
          i++;
        } else if (l.trim() && /^\s+/.test(l) && !startsBlock(l) && items.length) {
          // Línea con sangría: sigue el elemento anterior.
          items[items.length - 1].text += `\n${l.trim()}`;
          i++;
        } else break;
      }
      blocks.push({ type: 'list', ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) body.push(lines[i++]);
    blocks.push({ type: 'paragraph', text: body.join('\n') });
  }
  return blocks;
}

// Código, imagen, enlace, negrita, cursiva, tachado, fórmula y direcciones sueltas, en ese orden.
const INLINE =
  /(`+)([\s\S]*?[^`])\1(?!`)|!\[([^\]\n]*)\]\(\s*([^()\s]+)\s*\)|\[([^\]\n]+)\]\(\s*([^()\s]+)\s*\)|\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__|~~(?=\S)([\s\S]*?\S)~~|\*(?=[^\s*])([^*\n]*?[^\s*])\*|(?<![\w\\])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)|\$(?=[^\s$])([^$\n]*?[^\s$])\$|(https?:\/\/[^\s<>()]+[^\s<>().,:;"'!?\]])/g;

interface Ctx {
  resolve: ImageResolver;
  images: { n: number };
}

/** Texto con saltos de línea como <br>. */
function plain(text: string, key: string): ReactNode[] {
  return text.split('\n').flatMap((part, i) => (i ? [<br key={`${key}-br${i}`} />, part] : [part]));
}

function inline(text: string, ctx: Ctx, key: string, depth = 0): ReactNode[] {
  if (depth > 8) return plain(text, key);
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(...plain(text.slice(last, at), `${key}-t${n}`));
    const k = `${key}-${n++}`;
    if (m[1] !== undefined) out.push(<code key={k}>{m[2].trim() || m[2]}</code>);
    else if (m[4] !== undefined) out.push(image(m[3], m[4], ctx, k));
    else if (m[6] !== undefined) {
      const url = m[6];
      out.push(
        SAFE_LINK.test(url) ? (
          <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow">
            {inline(m[5], ctx, k, depth + 1)}
          </a>
        ) : (
          <Fragment key={k}>{inline(m[5], ctx, k, depth + 1)}</Fragment>
        ),
      );
    } else if (m[7] !== undefined || m[8] !== undefined) out.push(<strong key={k}>{inline(m[7] ?? m[8], ctx, k, depth + 1)}</strong>);
    else if (m[9] !== undefined) out.push(<del key={k}>{inline(m[9], ctx, k, depth + 1)}</del>);
    else if (m[10] !== undefined || m[11] !== undefined) out.push(<em key={k}>{inline(m[10] ?? m[11], ctx, k, depth + 1)}</em>);
    else if (m[12] !== undefined)
      out.push(
        <code key={k} className="md-math">
          {m[12]}
        </code>,
      );
    else if (m[13] !== undefined)
      out.push(
        <a key={k} href={m[13]} target="_blank" rel="noopener noreferrer nofollow">
          {m[13]}
        </a>,
      );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(...plain(text.slice(last), `${key}-t${n}`));
  return out;
}

function image(alt: string, ref: string, ctx: Ctx, key: string): ReactNode {
  const n = ++ctx.images.n;
  const label = alt.trim() && alt.trim().toLowerCase() !== 'imagen' ? alt.trim() : `Imagen ${n}`;
  if (ref.startsWith('coreimg:') || ref.startsWith('data:')) {
    const src = ctx.resolve(ref);
    if (src === undefined)
      return (
        <span key={key} className="md-img md-img--missing">
          Cargando la imagen…
        </span>
      );
    if (src === null)
      return (
        <span key={key} className="md-img md-img--missing">
          {label}: no disponible. Solo está en el navegador donde se añadió.
        </span>
      );
    return <img key={key} className="md-img" src={src} alt={label} loading="lazy" />;
  }
  // Imágenes de otras webs: un enlace, sin cargarlas.
  return SAFE_LINK.test(ref) ? (
    <a key={key} href={ref} target="_blank" rel="noopener noreferrer nofollow">
      {label} (enlace externo)
    </a>
  ) : (
    <Fragment key={key}>{label}</Fragment>
  );
}

function renderBlocks(blocks: Block[], ctx: Ctx, headingBase: number, key: string, depth: number): ReactNode[] {
  return blocks.map((b, i) => {
    const k = `${key}${i}`;
    switch (b.type) {
      case 'heading': {
        const Tag = `h${Math.min(6, headingBase + b.level - 1)}` as 'h2';
        return (
          <Tag key={k} className="md-heading">
            {inline(b.text, ctx, k)}
          </Tag>
        );
      }
      case 'paragraph':
        return <p key={k}>{inline(b.text, ctx, k)}</p>;
      case 'code':
        return (
          <pre key={k} className="md-code" tabIndex={0} aria-label={b.lang ? `Código (${b.lang})` : 'Código'}>
            <code>{b.text}</code>
          </pre>
        );
      case 'math':
        return (
          <pre key={k} className="md-code md-math" tabIndex={0} aria-label="Fórmula">
            <code>{b.text}</code>
          </pre>
        );
      case 'quote':
        return <blockquote key={k}>{depth < 5 ? renderBlocks(parseBlocks(b.text), ctx, headingBase, `${k}-`, depth + 1) : plain(b.text, k)}</blockquote>;
      case 'rule':
        return <hr key={k} />;
      case 'list': {
        const items = b.items.map((it, j) => (
          <li key={j} className={it.task === null ? undefined : 'md-task'}>
            {it.task !== null && <span className={`md-check${it.task ? ' md-check--on' : ''}`} role="img" aria-label={it.task ? 'Hecho' : 'Por hacer'} />}
            <span>{inline(it.text, ctx, `${k}-${j}`)}</span>
          </li>
        ));
        return b.ordered ? (
          <ol key={k} start={b.start === 1 ? undefined : b.start}>
            {items}
          </ol>
        ) : (
          <ul key={k}>{items}</ul>
        );
      }
    }
  });
}

/**
 * Muestra Markdown sin HTML. `headingBase` es el nivel de `#` (2 = <h2>) para
 * no romper el orden de títulos de la página.
 */
export function Markdown({ text, resolveImage = defaultResolver, headingBase = 2, className }: { text: string; resolveImage?: ImageResolver; headingBase?: number; className?: string }) {
  const ctx: Ctx = { resolve: resolveImage, images: { n: 0 } };
  return <div className={className ? `markdown ${className}` : 'markdown'}>{renderBlocks(parseBlocks(text), ctx, headingBase, 'b', 0)}</div>;
}

/** Texto sin marcas de Markdown (para extractos y búsquedas). */
export function markdownToText(src: string): string {
  return src
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) => (alt.trim() ? `[${alt.trim()}]` : '[imagen]'))
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]\s+\[[ xX]\]|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|~~|`+|\$\$?)/g, '')
    .replace(/(^|\W)[*_](\S[^*_]*?)[*_](?=\W|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

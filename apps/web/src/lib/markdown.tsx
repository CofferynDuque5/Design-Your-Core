import { DATA_IMAGE, isNoteImageRef, MD_MAX_QUOTE_DEPTH, mdImageLabel, parseBlocks, parseInline, SAFE_LINK, type MdBlock, type MdInline } from '@dyc/core';
import { Fragment, type ReactNode } from 'react';

/**
 * Markdown mínimo y SEGURO para las notas y las respuestas del Asistente.
 * El análisis está en @dyc/core (lo comparte el móvil); aquí todo se
 * convierte en elementos de React (el texto siempre va escapado): nunca se
 * inserta HTML. Las imágenes de otras webs se muestran como enlace para no
 * cargar nada de terceros.
 */

/**
 * Devuelve la dirección de una imagen de la nota: el texto a usar en `src`,
 * `null` si no está disponible o `undefined` mientras se carga.
 */
export type ImageResolver = (ref: string) => string | null | undefined;

/** Por defecto solo se muestran las imágenes incrustadas; `coreimg:` necesita quien las cargue. */
const defaultResolver: ImageResolver = (ref) => (DATA_IMAGE.test(ref) ? ref : null);

export { markdownToText } from '@dyc/core';

interface Ctx {
  resolve: ImageResolver;
  images: { n: number };
}

/** Texto con saltos de línea como <br>. */
function plain(text: string, key: string): ReactNode[] {
  return text.split('\n').flatMap((part, i) => (i ? [<br key={`${key}-br${i}`} />, part] : [part]));
}

function inline(tokens: MdInline[], ctx: Ctx, key: string): ReactNode[] {
  return tokens.flatMap((t, n): ReactNode | ReactNode[] => {
    const k = `${key}-${n}`;
    switch (t.type) {
      case 'text':
        return plain(t.text, k);
      case 'code':
        return <code key={k}>{t.text}</code>;
      case 'math':
        return (
          <code key={k} className="md-math">
            {t.text}
          </code>
        );
      case 'image':
        return image(t.alt, t.ref, ctx, k);
      case 'link':
        return t.href ? (
          <a key={k} href={t.href} target="_blank" rel="noopener noreferrer nofollow">
            {inline(t.children, ctx, k)}
          </a>
        ) : (
          <Fragment key={k}>{inline(t.children, ctx, k)}</Fragment>
        );
      case 'url':
        return (
          <a key={k} href={t.href} target="_blank" rel="noopener noreferrer nofollow">
            {t.href}
          </a>
        );
      case 'strong':
        return <strong key={k}>{inline(t.children, ctx, k)}</strong>;
      case 'em':
        return <em key={k}>{inline(t.children, ctx, k)}</em>;
      case 'del':
        return <del key={k}>{inline(t.children, ctx, k)}</del>;
    }
  });
}

function image(alt: string, ref: string, ctx: Ctx, key: string): ReactNode {
  const label = mdImageLabel(alt, ++ctx.images.n);
  if (isNoteImageRef(ref)) {
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

function renderBlocks(blocks: MdBlock[], ctx: Ctx, headingBase: number, key: string, depth: number): ReactNode[] {
  return blocks.map((b, i) => {
    const k = `${key}${i}`;
    switch (b.type) {
      case 'heading': {
        const Tag = `h${Math.min(6, headingBase + b.level - 1)}` as 'h2';
        return (
          <Tag key={k} className="md-heading">
            {inline(parseInline(b.text), ctx, k)}
          </Tag>
        );
      }
      case 'paragraph':
        return <p key={k}>{inline(parseInline(b.text), ctx, k)}</p>;
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
        return <blockquote key={k}>{depth < MD_MAX_QUOTE_DEPTH ? renderBlocks(parseBlocks(b.text), ctx, headingBase, `${k}-`, depth + 1) : plain(b.text, k)}</blockquote>;
      case 'rule':
        return <hr key={k} />;
      case 'list': {
        const items = b.items.map((it, j) => (
          <li key={j} className={it.task === null ? undefined : 'md-task'}>
            {it.task !== null && <span className={`md-check${it.task ? ' md-check--on' : ''}`} role="img" aria-label={it.task ? 'Hecho' : 'Por hacer'} />}
            <span>{inline(parseInline(it.text), ctx, `${k}-${j}`)}</span>
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

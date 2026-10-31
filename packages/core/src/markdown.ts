/**
 * Markdown mínimo y SEGURO de las notas y del Asistente, sin dependencias ni
 * HTML: aquí solo se analiza el texto y se devuelven bloques y trozos con su
 * tipo. Cada app los dibuja con sus propios componentes (React DOM en la web
 * y `Text` de React Native en el móvil), así que el texto siempre va escapado
 * y nunca se inserta HTML.
 *
 * Admite títulos, párrafos, negrita, cursiva, tachado, código (en línea y en
 * bloque), citas, listas, casillas, enlaces http(s) y mailto, separadores,
 * fórmulas `$…$` / `$$…$$` (como texto, sin dibujarlas) e imágenes
 * `coreimg:<id>` o incrustadas en base64. Las imágenes de otras webs se
 * muestran como enlace para no cargar nada de terceros.
 */

export type MdBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'math'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: Array<{ text: string; task: boolean | null }> }
  | { type: 'rule' };

/**
 * Trozos de una línea. `text` puede llevar saltos de línea (cada app los
 * dibuja a su manera). `link.href` es null si la dirección no es segura: se
 * muestra solo el texto.
 */
export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'math'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: MdInline[] }
  | { type: 'link'; href: string | null; children: MdInline[] }
  | { type: 'url'; href: string }
  | { type: 'image'; alt: string; ref: string };

/** Solo se enlazan direcciones http(s) y mailto. */
export const SAFE_LINK = /^(?:https?:\/\/|mailto:)/i;

/** Profundidad máxima de citas dentro de citas. */
export const MD_MAX_QUOTE_DEPTH = 5;

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+([\s\S]*)$/;

const startsBlock = (line: string) => FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || BULLET.test(line) || ORDERED.test(line) || line.trim() === '$$';

/** Bloques del texto (títulos, párrafos, listas…). */
export function parseBlocks(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
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

/** Trozos de una línea (negrita, enlaces, imágenes…). Más de 8 niveles anidados quedan como texto. */
export function parseInline(text: string, depth = 0): MdInline[] {
  if (depth > 8) return [{ type: 'text', text }];
  const out: MdInline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: 'text', text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ type: 'code', text: m[2].trim() || m[2] });
    else if (m[4] !== undefined) out.push({ type: 'image', alt: m[3], ref: m[4] });
    else if (m[6] !== undefined) out.push({ type: 'link', href: SAFE_LINK.test(m[6]) ? m[6] : null, children: parseInline(m[5], depth + 1) });
    else if (m[7] !== undefined || m[8] !== undefined) out.push({ type: 'strong', children: parseInline(m[7] ?? m[8], depth + 1) });
    else if (m[9] !== undefined) out.push({ type: 'del', children: parseInline(m[9], depth + 1) });
    else if (m[10] !== undefined || m[11] !== undefined) out.push({ type: 'em', children: parseInline(m[10] ?? m[11], depth + 1) });
    else if (m[12] !== undefined) out.push({ type: 'math', text: m[12] });
    else if (m[13] !== undefined) out.push({ type: 'url', href: m[13] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** Nombre de la imagen número `n` del texto: su texto alternativo o «Imagen n». */
export const mdImageLabel = (alt: string, n: number): string => (alt.trim() && alt.trim().toLowerCase() !== 'imagen' ? alt.trim() : `Imagen ${n}`);

/** Imagen propia de la nota (en la nube o incrustada), que no se carga de otra web. */
export const isNoteImageRef = (ref: string): boolean => ref.startsWith('coreimg:') || ref.startsWith('data:');

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

// ---------- Barra de formato de las notas ----------

export type FormatKind = 'bold' | 'italic' | 'heading' | 'list' | 'task' | 'code' | 'quote';

/** Texto nuevo y la selección que queda en el editor. */
export interface TextEdit {
  value: string;
  start: number;
  end: number;
}

const WRAP: Partial<Record<FormatKind, { mark: string; placeholder: string }>> = {
  bold: { mark: '**', placeholder: 'texto en negrita' },
  italic: { mark: '*', placeholder: 'texto en cursiva' },
  code: { mark: '`', placeholder: 'código' },
};

const PREFIX: Partial<Record<FormatKind, string>> = {
  heading: '## ',
  list: '- ',
  task: '- [ ] ',
  quote: '> ',
};

/** Rodea la selección (o un texto de ejemplo, que queda seleccionado) con la marca. */
function wrap(value: string, start: number, end: number, mark: string, placeholder: string): TextEdit {
  const selected = value.slice(start, end);
  const inner = selected || placeholder;
  const next = value.slice(0, start) + mark + inner + mark + value.slice(end);
  return { value: next, start: start + mark.length, end: start + mark.length + inner.length };
}

/** Añade (o quita, si ya lo tienen todas) un prefijo al principio de cada línea seleccionada. */
function prefixLines(value: string, start: number, end: number, prefix: string): TextEdit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const endAt = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nl = value.indexOf('\n', endAt);
  const lineEnd = nl === -1 ? value.length : nl;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  // Otro tipo de lista o título se sustituye en lugar de acumularse.
  const strip = (l: string) => l.replace(/^(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/, '');
  const all = lines.every((l) => l.startsWith(prefix));
  const changed = lines.map((l) => (all ? l.slice(prefix.length) : prefix + strip(l)));
  const block = changed.join('\n');
  const next = value.slice(0, lineStart) + block + value.slice(lineEnd);
  if (start === end) {
    // Sin selección: el cursor queda al final de la línea.
    const pos = lineStart + block.length;
    return { value: next, start: pos, end: pos };
  }
  return { value: next, start: lineStart, end: lineStart + block.length };
}

/** Aplica un botón de la barra de formato a la selección `start`–`end`. */
export function applyFormat(value: string, start: number, end: number, kind: FormatKind): TextEdit {
  const selected = value.slice(start, end);
  if (kind === 'code' && selected.includes('\n')) {
    // Varias líneas: bloque de código.
    const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const text = `${before}\`\`\`\n${selected}\n\`\`\`\n`;
    return { value: value.slice(0, start) + text + value.slice(end), start: start + before.length + 4, end: start + before.length + 4 + selected.length };
  }
  const w = WRAP[kind];
  if (w) return wrap(value, start, end, w.mark, w.placeholder);
  return prefixLines(value, start, end, PREFIX[kind] as string);
}

/** Inserta un bloque (p. ej. una imagen) en su propia línea donde está el cursor. */
export function insertBlock(value: string, start: number, end: number, block: string): TextEdit {
  const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const after = value[end] === '\n' || end >= value.length ? '\n' : '\n\n';
  const text = before + block + after;
  const pos = start + text.length;
  return { value: value.slice(0, start) + text + value.slice(end), start: pos, end: pos };
}

// ---------- Fórmulas ----------

const MATH_SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝',
  infty: '∞', partial: '∂', nabla: '∇', sum: 'Σ', prod: 'Π', int: '∫', oint: '∮', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔',
  in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', emptyset: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨',
  angle: '∠', degree: '°', circ: '∘', ldots: '…', cdots: '⋯', dots: '…', lim: 'lim', sin: 'sin', cos: 'cos', tan: 'tan', log: 'log', ln: 'ln', exp: 'exp',
  quad: ' ', qquad: '  ', ',': ' ', ';': ' ', '!': '', left: '', right: '', mathrm: '', text: '', mathbf: '', displaystyle: '',
};

/** Trozo de una fórmula: texto normal, exponente o subíndice. */
export interface MathRun {
  text: string;
  pos: 'base' | 'sup' | 'sub';
}

/** Lee un grupo `{…}` (con llaves anidadas) o un solo carácter/comando desde `i`. */
function mathGroup(src: string, i: number): { body: string; end: number } {
  while (src[i] === ' ') i++;
  if (src[i] === '{') {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) return { body: src.slice(i + 1, j), end: j + 1 };
    }
    return { body: src.slice(i + 1), end: src.length };
  }
  if (src[i] === '\\') {
    const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
    if (m) return { body: m[0], end: i + m[0].length };
  }
  return { body: src[i] ?? '', end: i + 1 };
}

/** Texto plano de una fórmula LaTeX sencilla (sin exponentes, que van aparte). */
function mathPlain(src: string): string {
  return mathRuns(src)
    .map((r) => (r.pos === 'base' ? r.text : r.pos === 'sup' ? `^${r.text.length > 1 ? `(${r.text})` : r.text}` : `_${r.text.length > 1 ? `(${r.text})` : r.text}`))
    .join('');
}

/**
 * Fórmula LaTeX sencilla → trozos para dibujarla: letras griegas y símbolos,
 * `\frac{a}{b}` → a/b, `\sqrt{x}` → √(x), `x^2`, `x_{i}`. No es un motor
 * completo de LaTeX: lo que no entiende se deja tal cual, nunca como HTML.
 */
export function mathRuns(src: string): MathRun[] {
  const out: MathRun[] = [];
  const push = (text: string, pos: MathRun['pos'] = 'base') => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.pos === pos) last.text += text;
    else out.push({ text, pos });
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '^' || c === '_') {
      const g = mathGroup(src, i + 1);
      push(mathPlain(g.body), c === '^' ? 'sup' : 'sub');
      i = g.end;
    } else if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      const name = m ? m[1] : '';
      i += m ? m[0].length : 1;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const a = mathGroup(src, i);
        const b = mathGroup(src, a.end);
        const wrap = (t: string) => (!t || /^[\w.]+$/.test(t) ? t : `(${t})`);
        push(`${wrap(mathPlain(a.body))}/${wrap(mathPlain(b.body))}`);
        i = b.end;
      } else if (name === 'sqrt') {
        const a = mathGroup(src, i);
        push(`√(${mathPlain(a.body)})`);
        i = a.end;
      } else if (name in MATH_SYMBOLS) push(MATH_SYMBOLS[name]);
      else if (name === '{' || name === '}' || name === '%' || name === '$' || name === '#' || name === '&' || name === '_') push(name);
      else push(`\\${name}`);
    } else if (c === '{' || c === '}') i++;
    else {
      push(c);
      i++;
    }
  }
  return out;
}

/** La fórmula en una sola línea de texto (para lectores de pantalla y para copiar). */
export const mathSpoken = (src: string) => mathPlain(src).replace(/\s+/g, ' ').trim();

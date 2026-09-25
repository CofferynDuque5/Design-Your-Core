// Barra de formato de las notas: cambia el texto y la selección del editor.

export type FormatKind = 'bold' | 'italic' | 'heading' | 'list' | 'task' | 'code' | 'quote';

export interface Edit {
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
function wrap(value: string, start: number, end: number, mark: string, placeholder: string): Edit {
  const selected = value.slice(start, end);
  const inner = selected || placeholder;
  const next = value.slice(0, start) + mark + inner + mark + value.slice(end);
  return { value: next, start: start + mark.length, end: start + mark.length + inner.length };
}

/** Añade (o quita, si ya lo tienen todas) un prefijo al principio de cada línea seleccionada. */
function prefixLines(value: string, start: number, end: number, prefix: string): Edit {
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

export function applyFormat(value: string, start: number, end: number, kind: FormatKind): Edit {
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
export function insertBlock(value: string, start: number, end: number, block: string): Edit {
  const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const after = value[end] === '\n' || end >= value.length ? '\n' : '\n\n';
  const text = before + block + after;
  const pos = start + text.length;
  return { value: value.slice(0, start) + text + value.slice(end), start: pos, end: pos };
}

import { describe, expect, it } from 'vitest';
import { applyFormat, insertBlock, markdownToText, mdImageLabel, parseBlocks, parseInline } from '../src/markdown.js';
import {
  BREATH_PATTERNS,
  breathClock,
  breathCycleMs,
  breathExpanded,
  breathPhase,
  filterNotes,
  groupNotesBySubject,
  meditationKindLabel,
  meditationStats,
  noteColorOf,
  notePreview,
  noteSubjectOf,
  noteTagList,
  noteTitleOf,
  searchFold,
  workBucketOf,
  workProjectOf,
  workStatusOf,
} from '../src/tools.js';
import type { LegacyMeditation, LegacyNote, LegacyWorkItem } from '../src/legacy.js';

describe('Markdown de las notas (sin HTML)', () => {
  it('bloques: títulos, listas, casillas, citas, código, fórmulas y separadores', () => {
    const blocks = parseBlocks('# Tema\n- uno\n  sigue\n- [x] hecho\n\n3. tres\n\n> cita\n> dos\n\n```py\nprint("<hola>")\n```\n$$\n\\int x\n$$\n---\nfin');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Tema' },
      { type: 'list', ordered: false, start: 1, items: [{ text: 'uno\nsigue', task: null }, { text: 'hecho', task: true }] },
      { type: 'list', ordered: true, start: 3, items: [{ text: 'tres', task: null }] },
      { type: 'quote', text: 'cita\ndos' },
      { type: 'code', lang: 'py', text: 'print("<hola>")' },
      { type: 'math', text: '\\int x' },
      { type: 'rule' },
      { type: 'paragraph', text: 'fin' },
    ]);
  });

  it('trozos: el HTML queda como texto y solo se enlazan http(s) y mailto', () => {
    expect(parseInline('<b>no</b> **sí**')).toEqual([
      { type: 'text', text: '<b>no</b> ' },
      { type: 'strong', children: [{ type: 'text', text: 'sí' }] },
    ]);
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ type: 'text', text: '[x](javascript:alert(1))' }]);
    expect(parseInline('[malo](javascript:void) [bien](https://example.com) https://ejemplo.org/x.')).toEqual([
      { type: 'link', href: null, children: [{ type: 'text', text: 'malo' }] },
      { type: 'text', text: ' ' },
      { type: 'link', href: 'https://example.com', children: [{ type: 'text', text: 'bien' }] },
      { type: 'text', text: ' ' },
      { type: 'url', href: 'https://ejemplo.org/x' },
      { type: 'text', text: '.' },
    ]);
    expect(parseInline('`x<y` $E=mc^2$ ~~no~~ *a* ![foto](coreimg:ab)')).toEqual([
      { type: 'code', text: 'x<y' },
      { type: 'text', text: ' ' },
      { type: 'math', text: 'E=mc^2' },
      { type: 'text', text: ' ' },
      { type: 'del', children: [{ type: 'text', text: 'no' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'a' }] },
      { type: 'text', text: ' ' },
      { type: 'image', alt: 'foto', ref: 'coreimg:ab' },
    ]);
    // snake_case no es cursiva.
    expect(parseInline('mi_variable_larga')).toEqual([{ type: 'text', text: 'mi_variable_larga' }]);
    expect(mdImageLabel('imagen', 2)).toBe('Imagen 2');
    expect(mdImageLabel(' Esquema ', 1)).toBe('Esquema');
  });

  it('texto plano y barra de formato', () => {
    expect(markdownToText('# Ondas\n- [ ] **Repasar** la _fórmula_ `f=1/T`\n![imagen](coreimg:a)')).toBe('Ondas Repasar la fórmula f=1/T [imagen]');
    expect(applyFormat('hola mundo', 5, 10, 'bold')).toEqual({ value: 'hola **mundo**', start: 7, end: 12 });
    expect(applyFormat('- uno', 2, 2, 'task')).toEqual({ value: '- [ ] uno', start: 9, end: 9 });
    expect(applyFormat('- uno\n- dos', 0, 11, 'list').value).toBe('uno\ndos');
    expect(insertBlock('antes', 5, 5, '![imagen](coreimg:x)')).toEqual({ value: 'antes\n![imagen](coreimg:x)\n', start: 27, end: 27 });
  });
});

describe('tanda 4: Notas, Trabajo y Respiración', () => {
  const note = (over: Partial<LegacyNote>): LegacyNote => ({ id: 'n', title: 'T', subject: 'General', date: '', tag: '', excerpt: '', body: '', commit: false, tags: '', shareId: null, ...over });

  it('notas: valores por defecto, búsqueda sin tildes, etiquetas y grupos por materia', () => {
    const notes = [
      note({ id: 'a', title: 'Ondas', subject: 'Física', body: '# Ondas\n**Periodo** y frecuencia', tags: 'Examen, repaso' }),
      note({ id: 'b', title: '  ', subject: '', body: 'Lista de la compra', tags: 'casa' }),
      note({ id: 'c', title: 'Derivadas', subject: 'cálculo', tags: 'examen' }),
    ];
    expect(noteTitleOf(notes[1])).toBe('Nota sin título');
    expect(noteSubjectOf(notes[1])).toBe('General');
    expect(noteColorOf(notes[0])).toMatch(/^#[0-9A-F]{6}$/i);
    expect(noteColorOf(note({ tag: '#123456' }))).toBe('#123456');
    expect(notePreview(notes[0])).toBe('Ondas Periodo y frecuencia');
    expect(noteTagList(notes)).toEqual(['casa', 'examen', 'repaso']);
    expect(searchFold('Física ÁRBOL')).toBe('fisica arbol');
    expect(filterNotes(notes, 'fisica', '').map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(notes, 'FRECUENCIA', '').map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(notes, '', 'examen').map((n) => n.id)).toEqual(['a', 'c']);
    expect(groupNotesBySubject(notes).map(([s, l]) => [s, l.length])).toEqual([
      ['cálculo', 1],
      ['Física', 1],
      ['General', 1],
    ]);
  });

  it('trabajo: proyecto, estado y grupo', () => {
    const w = (over: Partial<LegacyWorkItem>) => ({ project: 'p2', status: 'curso', done: false, ...over }) as LegacyWorkItem;
    expect(workProjectOf(w({ project: 'p9' as never }))).toBe('p1');
    expect(workStatusOf(w({ status: 'raro' as never }))).toBe('todo');
    expect(workBucketOf(w({}))).toBe('curso');
    expect(workBucketOf(w({ done: true }))).toBe('hecho');
  });

  it('respiración: fases, círculo, reloj y minutos', () => {
    expect(breathCycleMs('caja')).toBe(16_000);
    expect(breathCycleMs('478')).toBe(19_000);
    expect(breathPhase('caja', 0)).toEqual({ phase: 'in', index: 0, seconds: 4, secondsLeft: 4 });
    expect(breathPhase('caja', 5_200)).toEqual({ phase: 'hold', index: 1, seconds: 4, secondsLeft: 3 });
    expect(breathPhase('478', 11_000)).toEqual({ phase: 'out', index: 2, seconds: 8, secondsLeft: 8 });
    expect(breathPhase('478', 19_000 + 500).phase).toBe('in');
    expect(BREATH_PATTERNS.caja.phases.map((_, i) => breathExpanded('caja', i))).toEqual([true, true, false, false]);
    expect(breathClock(90_500)).toBe('1:31');
    expect(breathClock(-5)).toBe('0:00');
    const m = (id: string, date: string, minutes: unknown, kind = 'respiracion') => ({ id, date, minutes, kind }) as LegacyMeditation;
    // Sábado 26 de septiembre de 2026: la semana va del lunes 21 al domingo 27.
    const stats = meditationStats([m('a', '2026-09-26', 3), m('b', '2026-09-21', 5), m('c', '2026-09-20', 1), m('d', 'mal', 9), m('e', '2026-09-26', '2')], '2026-09-26');
    expect(stats).toMatchObject({ todayMinutes: 3, weekMinutes: 8 });
    expect(stats.valid.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(meditationKindLabel('respiracion')).toBe('Respiración');
    expect(meditationKindLabel('')).toBe('Respiración');
    expect(meditationKindLabel('Yoga')).toBe('Yoga');
  });
});

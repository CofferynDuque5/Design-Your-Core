import { describe, expect, it } from 'vitest';
import { applyLegacyOp, newLegacyId, type LegacyData } from '../src/legacy.js';
import {
  byWeekday,
  calendarCycleDays,
  contentPlatformOf,
  contentStageOf,
  coreImageIds,
  ideaCategoryOf,
  inlineImages,
  legacySubjectNames,
  newLegacySubId,
  newNoteBox,
  noteBoxKind,
  optionsWith,
  paletteWith,
  projectStatusOf,
  safeColor,
  uniqueTexts,
  calendarMarks,
  classWhenLabel,
  describeCalendarDay,
  drawableBlocks,
  durationLabel,
  focusClock,
  focusSpoken,
  layoutLanes,
  nextClass,
  normalizeHHMM,
  shiftMonth,
  TOOL_CATALOG,
  TOOL_GROUPS,
  toolStatus,
  validClass,
  byDateDesc,
  byTime,
  careDueLabel,
  careKindOf,
  careWhen,
  daySpan,
  goalCategoryOf,
  goalDeadlineLabel,
  journalStats,
  monthEnd,
  parseAmount,
  periodFlowOf,
  periodReminder,
  petSpeciesOf,
  sleepQualityLabel,
  toggleWeekday,
  txTypeOf,
  weekdaysOf,
  workoutRoutine,
} from '../src/tools.js';
import { utcDayKey } from '../src/legacy.js';

// Catálogo de «Más» y utilidades de las herramientas que comparten la web y el móvil.
describe('herramientas compartidas', () => {
  it('el catálogo tiene todas las secciones, cada una en un grupo, con rutas únicas', () => {
    expect(TOOL_CATALOG).toHaveLength(24);
    expect(new Set(TOOL_CATALOG.map((t) => t.path)).size).toBe(24);
    for (const t of TOOL_CATALOG) expect(TOOL_GROUPS.map((g) => g.id)).toContain(t.group);
  });

  it('cuenta los elementos con su unidad, «Vacío» o la nota', () => {
    const data: LegacyData = { todos: [{ id: 'a', title: 'x', done: false }, { id: 'b', title: 'y', done: true }], reminders: [] };
    const tool = (id: string) => TOOL_CATALOG.find((t) => t.id === id)!;
    expect(toolStatus(tool('pendientes'), data)).toBe('1 por hacer');
    expect(toolStatus(tool('calendario'), data)).toBe('Vacío');
    expect(toolStatus(tool('asistente'), data)).toBe('Con tu clave');
    expect(toolStatus(tool('agenda'), undefined)).toBe('Vacío');
  });

  it('aplica los cambios optimistas como el servidor', () => {
    const data: LegacyData = { todos: [{ id: 't1', title: 'A', done: false }, { id: 't2', title: 'B', done: false }], subtasks: [{ id: 's1', todoId: 't1', title: 'paso', done: false }] };
    expect(applyLegacyOp(data, 'todos', { type: 'update', id: 't1', patch: { done: true } }).todos?.[0].done).toBe(true);
    const removed = applyLegacyOp(data, 'todos', { type: 'remove', id: 't1' });
    expect(removed.todos?.map((t) => t.id)).toEqual(['t2']);
    expect(removed.subtasks).toEqual([]);
    expect(applyLegacyOp(data, 'todos', { type: 'reorder', ids: ['t2'] }).todos?.map((t) => t.id)).toEqual(['t2', 't1']);
    // Enfoque: lo más reciente primero.
    const focus = applyLegacyOp({ focus: [{ id: 'f1', mode: 'focus', seconds: 60, dateKey: '2026-09-25' }] }, 'focus', { type: 'add', item: { id: 'f2', mode: 'short', seconds: 30, dateKey: '2026-09-26' } });
    expect(focus.focus?.map((f) => f.id)).toEqual(['f2', 'f1']);
    // Tareas: `rem` sigue a `time`.
    const tasks = applyLegacyOp({ tasks: [{ id: 'k', title: 'x', pri: 'media', time: null, rem: false, done: false, tags: '' }] }, 'tasks', { type: 'update', id: 'k', patch: { time: '10:00' } });
    expect(tasks.tasks?.[0].rem).toBe(true);
  });

  it('crea ids válidos para el documento', () => {
    expect(newLegacyId()).toMatch(/^[\w-]{1,100}$/);
    expect(newLegacyId()).not.toBe(newLegacyId());
  });

  it('horas, duraciones y bloques', () => {
    expect(durationLabel(1.5)).toBe('1 h 30 min');
    expect(durationLabel(0.5)).toBe('30 min');
    expect(drawableBlocks([{ start: 8, dur: 1 }, { start: 'x', dur: 1 }, { start: 9, dur: 0 }] as Array<{ start: unknown; dur: unknown }>)).toHaveLength(1);
    const lanes = layoutLanes([
      { item: 'a', start: 8, end: 10 },
      { item: 'b', start: 9, end: 11 },
      { item: 'c', start: 12, end: 13 },
    ]);
    expect(lanes.map((l) => [l.item, l.lane, l.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ]);
  });

  it('horario: próxima clase y horas escritas a mano', () => {
    const classes = [
      { id: 'c1', day: 1, start: '08:00', end: '09:30', title: 'Cálculo', room: 'A-201', color: '#4F7CFF', subject: '' },
      { id: 'c2', day: 3, start: '10:00', end: '11:00', title: 'Física', room: '', color: '#0FA968', subject: '' },
    ];
    // Lunes 28 de septiembre de 2026 a las 8:15 (hora local).
    const monday = new Date(2026, 8, 28, 8, 15);
    const now = nextClass(classes, monday)!;
    expect(now.c.id).toBe('c1');
    expect(classWhenLabel(now.c, now.wait, now.ongoing, monday)).toBe('Ahora, hasta las 09:30');
    const later = new Date(2026, 8, 28, 10, 0);
    const next = nextClass(classes, later)!;
    expect(classWhenLabel(next.c, next.wait, next.ongoing, later)).toBe('Miércoles a las 10:00');
    expect(validClass({ ...classes[0], end: '07:00' })).toBe(false);
    expect(normalizeHHMM('8:30')).toBe('08:30');
    expect(normalizeHHMM('0830')).toBe('08:30');
    expect(normalizeHHMM('hola')).toBe('hola');
  });

  it('enfoque: reloj y texto para lectores', () => {
    expect(focusClock(25 * 60_000)).toBe('25:00');
    expect(focusClock(61_200)).toBe('01:02');
    expect(focusSpoken(61_000)).toBe('1 minuto y 1 segundo');
    expect(focusSpoken(0)).toBe('0 segundos');
  });

  it('calendario: eventos de cada mes y marcas de otras secciones', () => {
    const data = {
      reminders: [
        { id: 'r1', day: 31, title: 'Pagar', when: '', color: '#0FA968', icon: 'doc', on: true },
        { id: 'r2', day: 5, title: 'Dentista', when: '14:00', color: '#4F7CFF', icon: 'doc', on: true },
        { id: 'r3', day: 5, title: 'Apagado', when: '', color: '#4F7CFF', icon: 'doc', on: false },
      ],
      workouts: [{ id: 'w', date: '2026-09-05', plan: 'Fuerza', minutes: 40 }],
      goals: [{ id: 'g', deadline: '2026-09-20', title: 'Leer' }],
      journal: [{ id: 'j', date: '2026-10-01' }],
    } as unknown as LegacyData;
    const marks = calendarMarks(data, '2026-09-01', calendarCycleDays(data, '2026-09-01', '2026-09-26', false));
    // Septiembre tiene 30 días: el evento del 31 no aparece.
    expect(marks.get('2026-09-30')).toBeUndefined();
    expect([...(marks.get('2026-09-05') ?? [])]).toEqual(['event', 'workout']);
    expect([...(marks.get('2026-09-20') ?? [])]).toEqual(['goal']);
    expect(describeCalendarDay('2026-09-05', marks, data.reminders ?? [])).toBe(': 1 evento, entreno');
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('tanda 2: colores y opciones conservan el valor guardado', () => {
    expect(safeColor('#12abEF', '#000000')).toBe('#12abEF');
    expect(safeColor('rojo', '#000000')).toBe('#000000');
    expect(safeColor(undefined, '#4F7CFF')).toBe('#4F7CFF');
    expect(paletteWith(['#4F7CFF', '#0FA968'], '#4f7cff')).toEqual(['#4F7CFF', '#0FA968']);
    expect(paletteWith(['#4F7CFF'], '#123456')).toEqual(['#4F7CFF', '#123456']);
    expect(optionsWith(['js', 'ts'], 'rust')).toEqual(['js', 'ts', 'rust']);
    expect(optionsWith(['js', 'ts'], '')).toEqual(['js', 'ts']);
  });

  it('tanda 2: valores desconocidos se muestran como los de por defecto', () => {
    expect(projectStatusOf({ status: 'revision' })).toBe('revision');
    expect(projectStatusOf({ status: 'raro' })).toBe('curso');
    expect(contentPlatformOf({ platform: 'vimeo' as never })).toBe('otro');
    expect(contentStageOf({ stage: 'grabar' })).toBe('grabar');
    expect(contentStageOf({ stage: undefined as never })).toBe('idea');
    expect(ideaCategoryOf({ category: 'web' })).toBe('web');
    expect(ideaCategoryOf({ category: 'x' as never })).toBe('otro');
    expect(noteBoxKind({ kind: 'code' })).toBe('code');
    expect(noteBoxKind({ kind: 'dibujo' as never })).toBe('text');
  });

  it('tanda 2: cajitas nuevas, ids de pasos, textos únicos y materias', () => {
    expect(newNoteBox('b1', 'n1', 'text')).toEqual({ id: 'b1', notebookId: 'n1', title: '', text: '', color: '#FFF7D6', kind: 'text', lang: '' });
    expect(newNoteBox('b2', 'n1', 'code')).toEqual({ id: 'b2', notebookId: 'n1', title: '', text: '', color: '#1e1e2e', kind: 'code', lang: 'js' });
    const g = globalThis as { crypto?: unknown };
    const saved = Object.getOwnPropertyDescriptor(g, 'crypto');
    Object.defineProperty(g, 'crypto', { value: undefined, configurable: true });
    try {
      expect(newLegacySubId()).toMatch(/^x[a-z0-9]{1,7}$/);
    } finally {
      if (saved) Object.defineProperty(g, 'crypto', saved);
    }
    expect(uniqueTexts(['Física', '', '  ', 'Álgebra', 'Física', 3, null, 'Cálculo'])).toEqual(['Álgebra', 'Cálculo', 'Física']);
    expect(legacySubjectNames({ subjects: [{ name: 'Física' }, { name: '' }, null, { name: 'Arte' }] })).toEqual(['Arte', 'Física']);
    expect(legacySubjectNames({ subjects: 'roto' })).toEqual([]);
  });

  it('tanda 2: clases por semana e imágenes de las cajitas', () => {
    const c = (day: number, start: string) => ({ id: `${day}${start}`, day, start, end: '23:00', title: '', room: '', color: '', subject: '' });
    expect([c(3, '08:00'), c(1, '10:00'), c(1, '08:00')].sort(byWeekday).map((x) => x.id)).toEqual(['108:00', '110:00', '308:00']);
    const text = 'Mira ![a](coreimg:abc_1) y coreimg:abc_1 y ![b](coreimg:zz-9)\n![c](data:image/png;base64,iVBOR=) data:image/png;base64,iVBOR=';
    expect(coreImageIds(text)).toEqual(['abc_1', 'zz-9']);
    expect(coreImageIds(text)).toEqual(['abc_1', 'zz-9']);
    expect(inlineImages(text)).toEqual(['data:image/png;base64,iVBOR=']);
    expect(inlineImages('sin imágenes')).toEqual([]);
  });

  it('tanda 3: montos, tipos, categorías y valores desconocidos', () => {
    expect(parseAmount('12,30')).toBe(12.3);
    expect(parseAmount(' 1 200 ')).toBe(1200);
    expect(parseAmount('0.5')).toBe(0.5);
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('-3')).toBeNull();
    expect(parseAmount('doce')).toBeNull();
    expect(txTypeOf({ type: 'income' })).toBe('income');
    expect(txTypeOf({ type: 'raro' })).toBe('expense');
    expect(goalCategoryOf({ category: 'dinero' })).toBe('dinero');
    expect(goalCategoryOf({ category: 'viajes' })).toBe('personal');
    expect(petSpeciesOf({ species: 'dragon' })).toBe('other');
    expect(careKindOf({ kind: 'paseo' })).toBe('paseo');
    expect(periodFlowOf({ flow: 'x' })).toBe('medium');
    expect(weekdaysOf('135')).toBe('135');
    expect(weekdaysOf('089')).toBe('1234567');
    expect(weekdaysOf(undefined)).toBe('1234567');
    expect(toggleWeekday('135', '2')).toBe('1235');
    expect(toggleWeekday('135', '3')).toBe('15');
    expect(toggleWeekday('4', '4')).toBe('4');
    const byDate = [{ date: '2026-09-01' }, { date: '2026-09-20' }, { date: '2026-09-05' }].sort(byDateDesc);
    expect(byDate.map((d) => d.date)).toEqual(['2026-09-20', '2026-09-05', '2026-09-01']);
    expect([{ time: '' }, { time: '18:00' }, { time: '07:30' }].sort(byTime).map((x) => x.time)).toEqual(['07:30', '18:00', '']);
  });

  it('tanda 3: fechas límite, periodos, avisos y rutinas', () => {
    expect(goalDeadlineLabel('2026-09-26', '2026-09-26')).toEqual({ text: 'Vence hoy', late: false });
    expect(goalDeadlineLabel('2026-09-27', '2026-09-26')).toEqual({ text: 'Falta 1 día · 27 sept', late: false });
    expect(goalDeadlineLabel('2026-09-29', '2026-09-26')).toEqual({ text: 'Faltan 3 días · 29 sept', late: false });
    expect(goalDeadlineLabel('2026-09-24', '2026-09-26')).toEqual({ text: 'Venció hace 2 días · 24 sept', late: true });
    expect(goalDeadlineLabel('', '2026-09-26')).toBeNull();
    expect(daySpan('2026-09-24', '2026-09-24')).toBe('24 sept');
    expect(daySpan('2026-09-24', '2026-09-28')).toBe('24–28 sept');
    expect(daySpan('2026-09-30', '2026-10-03')).toBe('30 sept – 3 oct');
    expect(monthEnd('2026-02-01')).toBe('2026-02-28');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(monthEnd('2026-09-15')).toBe('2026-09-30');
    expect(periodReminder('r1', '2026-10-24')).toEqual({ id: 'r1', day: 24, title: '🩸 Posible inicio del periodo', when: 'octubre', color: '#EC6A9C', icon: 'doc', on: true });
    expect(workoutRoutine('o1', 'Full body')).toEqual({ id: 'o1', title: '🏋️ Entreno: Full body', time: '18:00', days: '1234567', icon: 'bell', sound: true, enabled: true });
    expect(sleepQualityLabel(4)).toBe('Buena (4/5)');
    expect(sleepQualityLabel(0)).toBe('Sin calidad');
    expect(sleepQualityLabel('5')).toBe('Sin calidad');
  });

  it('tanda 3: cuándo toca cada cuidado de mascota', () => {
    // Sábado 26 de septiembre de 2026, 10:00 (hora local).
    const now = new Date(2026, 8, 26, 10, 0);
    const today = utcDayKey(now);
    const care = (over: Record<string, unknown>) => ({ days: '1234567', time: '', enabled: true, lastDone: '', ...over });
    expect(careDueLabel(care({ time: '08:00' }), now)).toBe('Hoy a las 08:00 · pendiente');
    expect(careWhen(care({ time: '08:00' }), false, now)).toBe('Hoy a las 08:00 · pendiente · Todos los días');
    expect(careDueLabel(care({ time: '20:00' }), now)).toBe('Hoy a las 20:00');
    expect(careDueLabel(care({ days: '7' }), now)).toBe('Mañana');
    expect(careDueLabel(care({ days: '12345', time: '07:00' }), now)).toBe('El lunes a las 07:00');
    expect(careDueLabel(care({ days: '6', time: '18:00', lastDone: today }), now)).toBe('Los sábados a las 18:00');
    expect(careWhen(care({ days: '6', time: '18:00', lastDone: today }), false, now)).toBe('Los sábados a las 18:00');
    expect(careWhen(care({ days: '12345' }), true, now)).toBe('Hecho hoy · Entre semana');
    expect(careDueLabel(care({ enabled: false }), now)).toBe('Aviso desactivado');
  });

  it('tanda 3: cifras del Diario', () => {
    const j = (date: string, mood = '') => ({ date, mood });
    const stats = journalStats([j('2026-09-26', '🙂'), j('2026-09-25', '😄'), j('2026-09-24', '🙂'), j('2026-09-20'), j('2026-08-31', '😣'), j('mal')], '2026-09-26');
    expect(stats).toEqual({ month: 4, streak: 3, top: '🙂', topLabel: 'Bien' });
    // Sin entrada hoy, la racha cuenta desde ayer.
    expect(journalStats([j('2026-09-25'), j('2026-09-24')], '2026-09-26')).toEqual({ month: 2, streak: 2, top: null, topLabel: null });
    expect(journalStats([], '2026-09-26').streak).toBe(0);
  });
});

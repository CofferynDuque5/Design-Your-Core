import { describe, expect, it } from 'vitest';
import {
  deriveLegacyPatch,
  NOTE_TAG_COLORS,
  noteDateLabel,
  noteTag,
  checkItems,
  cycleInfo,
  cyclePredictions,
  goalPercent,
  goalStep,
  goalToggleDone,
  legacyObject,
  legacyObjectPatchSchemas,
  legacyObjectSchemas,
  monthSummary,
  nextDue,
  periodRuns,
  sleepMinutes,
  sleepStats,
  waterToday,
  workoutStats,
  type LegacyGoal,
  type LegacySleep,
  type LegacyTransaction,
  checkItemsPayload,
  dueThisWeek,
  focusStats,
  legacyItemSchemas,
  legacyPatchSchemas,
  mergeLegacyItem,
  nextFocusMode,
  parseDeadline,
  projectProgress,
  reorderById,
  splitTags,
  stepStates,
  type LegacyFocus,
} from '../src/legacy.js';
import { legacyVault, vaultMigrateSchema, vaultMono, vaultSecureOf, vaultSecureSchema } from '../src/vault.js';

describe('módulos de la app anterior', () => {
  it('completa los valores por defecto de la app anterior y rechaza campos extra', () => {
    expect(legacyItemSchemas.blocks.parse({ id: 'b1', label: 'Leer', start: 8.5, dur: 1 })).toEqual({ id: 'b1', label: 'Leer', sub: '', start: 8.5, dur: 1, kind: 'study' });
    expect(legacyItemSchemas.tasks.parse({ id: 't1', title: 'Llamar', time: '10:00' })).toEqual({ id: 't1', title: 'Llamar', pri: 'media', time: '10:00', rem: true, done: false, tags: '' });
    expect(legacyItemSchemas.reminders.parse({ id: 'r1', day: 14, title: 'Dentista' })).toMatchObject({ when: '', color: '#0FA968', icon: 'doc', on: true });
    expect(legacyItemSchemas.todos.safeParse({ id: 'a', title: 'x', extra: 1 }).success).toBe(false);
  });

  it('valida los formatos antiguos', () => {
    expect(legacyItemSchemas.reminders.safeParse({ id: 'r', day: 32, title: 'x' }).success).toBe(false);
    expect(legacyItemSchemas.reminders.safeParse({ id: 'r', day: 3, title: 'x', color: '#123456' }).success).toBe(false);
    expect(legacyItemSchemas.blocks.safeParse({ id: 'b', label: 'x', start: 23, dur: 2 }).success).toBe(false);
    expect(legacyItemSchemas.blocks.safeParse({ id: 'b', label: 'x', start: 8, dur: 1, kind: 'otro' }).success).toBe(false);
    expect(legacyItemSchemas.classes.safeParse({ id: 'c', day: 1, start: '10:00', end: '09:00', title: 'x' }).success).toBe(false);
    expect(legacyItemSchemas.classes.safeParse({ id: 'c', day: 8, start: '08:00', end: '09:00', title: 'x' }).success).toBe(false);
    expect(legacyItemSchemas.focus.safeParse({ id: 'f', mode: 'focus', seconds: 0, dateKey: '2026-09-25' }).success).toBe(false);
    expect(legacyItemSchemas.focus.safeParse({ id: 'f', mode: 'focus', seconds: 60, dateKey: '2026-02-30' }).success).toBe(false);
    expect(legacyItemSchemas.todos.safeParse({ id: 'mal id!', title: 'x' }).success).toBe(false);
  });

  it('un cambio parcial no trae valores por defecto ni deja cambiar el id', () => {
    expect(legacyPatchSchemas.tasks.parse({ done: true })).toEqual({ done: true });
    expect(legacyPatchSchemas.tasks.safeParse({ id: 'otro' }).success).toBe(false);
    expect(legacyPatchSchemas.reminders.safeParse({ day: 0 }).success).toBe(false);
  });

  it('reordena como la app anterior', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(reorderById(list, ['c', 'a', 'zz']).map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('alterna enfoque y descansos: largo tras cada cuarta sesión', () => {
    expect([1, 2, 3, 4, 5, 8].map((n) => nextFocusMode('focus', n))).toEqual(['short', 'short', 'short', 'long', 'short', 'long']);
    expect(nextFocusMode('short', 1)).toBe('focus');
    expect(nextFocusMode('long', 4)).toBe('focus');
  });

  it('calcula las estadísticas de enfoque', () => {
    const f = (dateKey: string, seconds = 1500, mode: LegacyFocus['mode'] = 'focus'): LegacyFocus => ({ id: `${dateKey}-${seconds}`, mode, seconds, dateKey });
    const records = [f('2026-09-25'), f('2026-09-25', 900), f('2026-09-25', 300, 'short'), f('2026-09-24'), f('2026-09-23'), f('2026-09-10', 3600)];
    expect(focusStats(records, '2026-09-25')).toEqual({ sessionsToday: 2, hoursWeek: (1500 * 3 + 900) / 3600, hoursTotal: (1500 * 3 + 900 + 3600) / 3600, streak: 3 });
    expect(focusStats(records, '2026-09-26').streak).toBe(3);
    expect(focusStats(records, '2026-09-27').streak).toBe(0);
  });

  it('tanda 2: valores por defecto de la app anterior', () => {
    expect(legacyItemSchemas.subjects.parse({ id: 's1', name: 'Física' })).toEqual({ id: 's1', name: 'Física', teacher: '', room: '', color: '#4F7CFF', nextClass: '', topics: [] });
    expect(legacyItemSchemas.projects.parse({ id: 'p1', title: 'Ensayo' })).toEqual({ id: 'p1', title: 'Ensayo', subject: '', deadline: '', status: 'curso', color: '#0FA968', milestones: [] });
    expect(legacyItemSchemas.roadmaps.parse({ id: 'r1', name: 'Ingeniería' })).toEqual({ id: 'r1', name: 'Ingeniería', color: '#8B5CF6', steps: [] });
    expect(legacyItemSchemas.notebooks.parse({ id: 'n1', category: '  ' })).toEqual({ id: 'n1', title: 'Cuaderno', category: 'General', subject: '', topic: '', color: '#4F7CFF', emoji: '📓' });
    expect(legacyItemSchemas.noteBoxes.parse({ id: 'b1', notebookId: 'n1' })).toEqual({ id: 'b1', notebookId: 'n1', title: '', text: '', color: '#FFF7D6', kind: 'text', lang: '' });
    expect(legacyItemSchemas.noteBoxes.parse({ id: 'b2', notebookId: 'n1', kind: 'code' })).toMatchObject({ color: '#1e1e2e', kind: 'code', lang: 'js' });
    expect(legacyItemSchemas.content.parse({ id: 'c1', title: 'Video' })).toEqual({ id: 'c1', title: 'Video', stage: 'idea', platform: 'youtube', notes: '', script: '', due: '' });
    expect(legacyItemSchemas.ideas.parse({ id: 'i1', title: 'App' })).toEqual({ id: 'i1', title: 'App', body: '', category: 'app', tags: '' });
    expect(legacyItemSchemas.projects.parse({ id: 'p2', title: 'x', milestones: [{ id: 'xk3j9a2b', name: 'Borrador' }] }).milestones).toEqual([{ id: 'xk3j9a2b', name: 'Borrador', done: false, date: '' }]);
  });

  it('tanda 2: rechaza estados, plataformas, categorías y subelementos inválidos', () => {
    expect(legacyItemSchemas.projects.safeParse({ id: 'p', title: 'x', status: 'hecho' }).success).toBe(false);
    expect(legacyItemSchemas.content.safeParse({ id: 'c', title: 'x', platform: 'twitch' }).success).toBe(false);
    expect(legacyItemSchemas.ideas.safeParse({ id: 'i', title: 'x', category: 'ventas' }).success).toBe(false);
    expect(legacyPatchSchemas.subjects.safeParse({ topics: [{ id: 't', name: 'x', extra: 1 }] }).success).toBe(false);
    expect(legacyPatchSchemas.roadmaps.safeParse({ steps: [{ name: 'sin id' }] }).success).toBe(false);
    expect(legacyPatchSchemas.noteBoxes.parse({ lang: 'python' })).toEqual({ lang: 'python' });
  });

  it('fusiona temas, hitos y pasos por id conservando lo que no conoce', () => {
    const subject = { id: 's', name: 'Física', topics: [{ id: 'a', name: 'Ondas', done: false, nota: 'vieja' }, { id: 'b', name: 'Óptica', done: false }], extra: 1 };
    const merged = mergeLegacyItem('subjects', subject, { topics: [{ id: 'a', name: 'Ondas', done: true }, { id: 'c', name: 'Calor', done: false }] });
    expect(merged).toEqual({ id: 's', name: 'Física', extra: 1, topics: [{ id: 'a', name: 'Ondas', done: true, nota: 'vieja' }, { id: 'c', name: 'Calor', done: false }] });
    expect(mergeLegacyItem('ideas', { id: 'i', title: 'x', raro: true }, { title: 'y' })).toEqual({ id: 'i', title: 'y', raro: true });
  });

  it('normaliza subelementos antiguos y envía solo los campos conocidos', () => {
    const list = checkItems([{ id: 'a', name: 'Uno', done: 1, extra: true }, null, { name: 'Sin id' }], () => 'nuevo');
    expect(list).toEqual([{ id: 'a', name: 'Uno', done: true, extra: true }, { id: 'nuevo', name: 'Sin id', done: false }]);
    expect(checkItemsPayload(list)).toEqual([{ id: 'a', name: 'Uno', done: true }, { id: 'nuevo', name: 'Sin id', done: false }]);
    expect(checkItemsPayload([{ id: 'm', name: 'Hito', done: false, date: '' }])).toEqual([{ id: 'm', name: 'Hito', done: false, date: '' }]);
  });

  it('progreso de proyectos y entregas de la semana como la app anterior', () => {
    expect(projectProgress({ status: 'curso', milestones: [] })).toBe(0);
    expect(projectProgress({ status: 'revision', milestones: [] })).toBe(90);
    expect(projectProgress({ status: 'entregado' })).toBe(100);
    expect(projectProgress({ status: 'entregado', milestones: [{ done: true }, { done: false }, { done: false }] })).toBe(33);
    const now = Date.parse('2026-09-25T12:00:00Z');
    expect(dueThisWeek('la próxima clase', now)).toBe(true); // no se entiende: cuenta, como antes
    expect(dueThisWeek('', now)).toBe(false);
    expect(dueThisWeek('28 SEP', now)).toBe(true);
    expect(dueThisWeek('25 sep.', now)).toBe(true);
    expect(dueThisWeek('20 SEP', now)).toBe(false);
    expect(dueThisWeek('3 de octubre', now)).toBe(false);
    expect(dueThisWeek('2026-09-28', now)).toBe(true);
    expect(dueThisWeek('2026-10-20', now)).toBe(false);
    expect(parseDeadline('20 SEP', new Date(now))?.getMonth()).toBe(8);
    expect(parseDeadline('5 dic 2027')?.getFullYear()).toBe(2027);
    expect(parseDeadline('31 foo')).toBeNull();
  });

  it('estados de los pasos de un roadmap y etiquetas', () => {
    expect(stepStates([{ done: true }, { done: false }, { done: false }, { done: false }])).toEqual(['done', 'current', 'next', 'locked']);
    expect(stepStates([{ done: true }, { done: true }])).toEqual(['done', 'done']);
    expect(stepStates([{ done: false }, { done: true }])).toEqual(['current', 'done']);
    expect(splitTags('examen, física , ,saas')).toEqual(['examen', 'física', 'saas']);
    expect(splitTags(undefined)).toEqual([]);
  });
  it('tanda 3: valores por defecto y formatos de la app anterior', () => {
    expect(legacyItemSchemas.transactions.parse({ id: 't', date: '2026-09-25', amount: 4.5, category: '  ' })).toEqual({ id: 't', date: '2026-09-25', amount: 4.5, type: 'expense', category: 'Otro', note: '' });
    expect(legacyItemSchemas.petCares.safeParse({ id: 'c', petId: 'p', title: 'x', days: '71' }).success).toBe(true);
    expect(legacyItemSchemas.petCares.safeParse({ id: 'c', petId: 'p', title: 'x', days: '' }).success).toBe(false);
    expect(legacyItemSchemas.meals.parse({ id: 'm', label: '', dateKey: '2026-09-25' }).label).toBe('Comida');
    expect(legacyItemSchemas.sleep.safeParse({ id: 's', date: '2026-09-25', bedtime: '23:00', waketime: '07:00', quality: 0 }).success).toBe(false);
    expect(legacyObjectSchemas.cycle.parse({})).toEqual({ cycleLength: 28, periodLength: 5 });
    expect(legacyObjectSchemas.dayLog.parse({ dateKey: '2026-09-25' })).toEqual({ dateKey: '2026-09-25', water: 0, waterGoal: 8 });
    expect(legacyObjectPatchSchemas.dayLog.parse({ water: 3 })).toEqual({ water: 3 });
    expect(legacyObjectPatchSchemas.cycle.safeParse({ cycleLength: 61 }).success).toBe(false);
    expect(legacyObject({ cycle: { periodLength: 4, extra: true } }, 'cycle')).toEqual({ cycleLength: 28, periodLength: 4, extra: true });
    expect(legacyObject({ dayLog: [] }, 'dayLog', '2026-09-25')).toEqual({ dateKey: '2026-09-25', water: 0, waterGoal: 8 });
  });

  it('finanzas: resumen del mes como la app anterior', () => {
    const tx = (id: string, date: string, amount: number, type: string, category = 'Otro'): LegacyTransaction => ({ id, date, amount, type, category, note: '' }) as LegacyTransaction;
    const s = monthSummary([tx('a', '2026-09-02', 1000, 'income', 'Sueldo'), tx('b', '2026-09-03', 120.3, 'expense', 'Comida'), tx('c', '2026-09-20', 30, 'expense', 'Ocio'), tx('d', '2026-09-21', 40.2, 'raro', 'Comida'), tx('e', '2026-08-30', 999, 'expense')], '2026-09');
    expect(s).toMatchObject({ income: 1000, expense: 190.5, balance: 809.5 });
    expect(s.byCategory).toEqual([{ category: 'Comida', amount: 160.5 }, { category: 'Ocio', amount: 30 }]);
    expect(s.items.map((t) => t.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('metas: +1, −1 y «Lograda»', () => {
    const g: LegacyGoal = { id: 'g', title: 'x', target: 3, current: 2, unit: '', deadline: '', category: 'personal', done: false };
    expect(goalStep(g, 1)).toEqual({ current: 3, done: true });
    expect(goalStep({ ...g, current: 0 }, -1)).toEqual({ current: 0, done: false });
    expect(goalToggleDone(g)).toEqual({ done: true, current: 3 });
    expect(goalToggleDone({ ...g, done: true })).toEqual({ done: false });
    expect(goalPercent({ current: 5, target: 8 })).toBe(63);
    expect(goalPercent({ current: 12, target: 8 })).toBe(100);
    expect(goalPercent({ current: 1, target: 0 })).toBe(0);
  });

  it('sueño y ejercicio: duración, medias y semana', () => {
    expect(sleepMinutes('23:30', '07:15')).toBe(465);
    expect(sleepMinutes('01:00', '09:00')).toBe(480);
    expect(sleepMinutes('bad', '09:00')).toBeNull();
    const s = (date: string, bedtime: string, waketime: string, quality: number): LegacySleep => ({ id: date, date, bedtime, waketime, quality, note: '' });
    const stats = sleepStats([s('2026-09-20', '23:00', '07:00', 4), s('2026-09-25', '00:00', '06:00', 2), s('2026-09-10', '22:00', '10:00', 5)], 2);
    expect(stats).toEqual({ nights: 2, avgMinutes: 420, avgQuality: 3 });
    expect(sleepStats([]).avgMinutes).toBeNull();
    const w = (date: string, minutes: number) => ({ id: date + minutes, date, plan: 'Full body', minutes });
    // 2026-09-25 es viernes: la semana va del 21 al 27.
    expect(workoutStats([w('2026-09-25', 30), w('2026-09-24', 15), w('2026-09-21', 20), w('2026-09-20', 40)], '2026-09-25')).toEqual({ weekCount: 3, weekMinutes: 65, total: 4, streak: 2 });
  });

  it('ciclo: día del ciclo, próximo periodo y ventana fértil como la app anterior', () => {
    const days = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-07-31'].map((date, i) => ({ id: `d${i}`, date }));
    const info = cycleInfo(days, { cycleLength: 28, periodLength: 5 }, '2026-09-25');
    expect(info).toEqual({ lastStart: '2026-08-30', cycleDay: 27, nextStart: '2026-09-27', daysUntilNext: 2, fertileStart: '2026-09-10', fertileEnd: '2026-09-14' });
    // Si el próximo ya pasó, avanza de ciclo en ciclo hasta que no quede en el pasado.
    expect(cycleInfo(days, { cycleLength: 28 }, '2026-10-30')?.nextStart).toBe('2026-11-22');
    expect(cycleInfo([], undefined, '2026-09-25')).toBeNull();
    // Registros futuros no mueven el inicio.
    expect(cycleInfo([...days, { id: 'f', date: '2026-12-01' }], undefined, '2026-09-25')?.lastStart).toBe('2026-08-30');
    const p = cyclePredictions(info, { cycleLength: 28, periodLength: 3 }, '2026-09-01', '2026-10-31', ['2026-09-28']);
    expect([...p.period]).toEqual(['2026-09-27', '2026-09-29', '2026-10-25', '2026-10-26', '2026-10-27']);
    expect([...p.fertile]).toEqual(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
    expect(periodRuns(days)).toEqual([
      { start: '2026-08-30', end: '2026-09-02', days: 4 },
      { start: '2026-07-31', end: '2026-07-31', days: 1 },
    ]);
  });

  it('cuidados y rutinas: próxima vez según los días y lo hecho hoy', () => {
    // Viernes 25 de septiembre de 2026, 10:00 local.
    const now = new Date(2026, 8, 25, 10, 0);
    const today = now.toISOString().slice(0, 10);
    expect(nextDue({ days: '1234567', time: '08:00' }, now)).toEqual({ inDays: 0, time: '08:00', late: true });
    expect(nextDue({ days: '1234567', time: '18:00', lastDone: today }, now)).toEqual({ inDays: 1, time: '18:00', late: false });
    expect(nextDue({ days: '1', time: '' }, now)).toEqual({ inDays: 3, time: '', late: false });
    expect(nextDue({ days: '5', time: '09:00', lastDone: today }, now)).toEqual({ inDays: 7, time: '09:00', late: false });
    expect(nextDue({ days: '1234567', enabled: false }, now)).toBeNull();
    expect(waterToday({ dateKey: '2026-09-25', water: 3 }, '2026-09-25')).toBe(3);
    expect(waterToday({ dateKey: '2026-09-24', water: 3 }, '2026-09-25')).toBe(0);
  });
});

describe('tanda 4: notas, trabajo, respiración y bóveda cifrada', () => {
  it('notas: valores por defecto, extracto y color de la materia como la app anterior', () => {
    const body = `# Ondas\n${'x'.repeat(200)}`;
    const note = legacyItemSchemas.notes.parse({ id: 'n1', title: '  ', subject: 'Física', date: '25 sept', body });
    expect(note).toEqual({ id: 'n1', title: 'Nota sin título', subject: 'Física', date: '25 sept', tag: noteTag('Física'), excerpt: body.slice(0, 90), body, commit: false, tags: '', shareId: null });
    // `|largo + primer código| % 5` sobre #0FA968 #4F7CFF #EC6A9C #8B5CF6 #E8912A.
    expect(noteTag('General')).toBe(NOTE_TAG_COLORS[(7 + 71) % 5]);
    expect(noteTag('Física')).toBe(NOTE_TAG_COLORS[(6 + 70) % 5]);
    expect(noteTag('')).toBe(NOTE_TAG_COLORS[0]);
    expect(legacyItemSchemas.notes.parse({ id: 'n2', subject: '' }).subject).toBe('General');
    // El cliente no decide `tag` ni `excerpt` (se recalculan), ni cambia el enlace público.
    expect(legacyItemSchemas.notes.parse({ id: 'n3', subject: 'Física', tag: '#000000', excerpt: 'otro', body: 'Hola' })).toMatchObject({ tag: noteTag('Física'), excerpt: 'Hola' });
    expect(legacyPatchSchemas.notes.safeParse({ shareId: 'abc' }).success).toBe(false);
    expect(legacyPatchSchemas.notes.safeParse({ excerpt: 'x' }).success).toBe(false);
    expect(deriveLegacyPatch('notes', { body: 'Hola' })).toEqual({ body: 'Hola', excerpt: 'Hola' });
    expect(deriveLegacyPatch('notes', { subject: 'Física' })).toEqual({ subject: 'Física', tag: noteTag('Física') });
    expect(deriveLegacyPatch('tasks', { time: null })).toEqual({ time: null, rem: false });
    expect(noteDateLabel(new Date(2026, 8, 25, 12))).toMatch(/^25 sept?\.?$/);
  });

  it('trabajo y respiración: formatos de la app anterior', () => {
    expect(legacyItemSchemas.workItems.parse({ id: 'w1', title: 'Informe' })).toEqual({ id: 'w1', title: 'Informe', project: 'p1', status: 'todo', done: false, due: '' });
    expect(legacyItemSchemas.workItems.safeParse({ id: 'w1', title: 'x', project: 'p4' }).success).toBe(false);
    expect(legacyItemSchemas.meditations.parse({ id: 'm1', date: '2026-09-25', minutes: 3 })).toEqual({ id: 'm1', date: '2026-09-25', minutes: 3, kind: 'respiracion' });
    expect(legacyItemSchemas.meditations.safeParse({ id: 'm1', date: '2026-09-25', minutes: 2.5 }).success).toBe(false);
  });

  it('bóveda: el servidor solo acepta datos cifrados con la forma exacta', () => {
    const b64 = (n: number) => Buffer.from(new Uint8Array(n).fill(7)).toString('base64');
    const vault = { v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: b64(16) }, check: { iv: b64(12), ct: b64(40) }, items: [{ id: 'a', iv: b64(12), ct: b64(80) }] };
    expect(vaultSecureSchema.parse(vault)).toEqual(vault);
    expect(vaultSecureOf({ vaultSecure: vault })).toEqual(vault);
    const bad: unknown[] = [
      { ...vault, kdf: { ...vault.kdf, iterations: 100_000 } },
      { ...vault, kdf: { ...vault.kdf, salt: b64(8) } },
      { ...vault, check: { ...vault.check, iv: b64(16) } },
      { ...vault, items: [{ id: 'a', iv: b64(12), ct: 'no es base64!' }] },
      { ...vault, items: [{ id: 'a', iv: b64(12), ct: b64(80), pass: 'hola' }] },
      { ...vault, items: [vault.items[0], vault.items[0]] },
      { ...vault, extra: 1 },
      { ...vault, v: 2 },
    ];
    for (const v of bad) expect(vaultSecureSchema.safeParse(v).success, JSON.stringify(v)).toBe(false);
    expect(vaultSecureOf({})).toBeNull();
    expect(vaultMigrateSchema.safeParse({ items: vault.items, legacyIds: ['id_1'] }).success).toBe(true);
    expect(vaultMigrateSchema.safeParse({ items: [], legacyIds: ['id_1'] }).success).toBe(false);
    expect(legacyVault({ vault: [{ id: 'v1', name: 'Banco', mono: 'BA', user: 'ana', pass: 'secreta' }, null, 'x'] })).toEqual([{ id: 'v1', name: 'Banco', mono: 'BA', user: 'ana', pass: 'secreta' }]);
    expect(vaultMono('GitHub')).toBe('GI');
    expect(vaultMono('banco del sol')).toBe('BD');
    expect(vaultMono('  ')).toBe('?');
  });
});

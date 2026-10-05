import { describe, expect, it } from 'vitest';
import {
  CARE_KIND_INFO,
  CARE_KINDS,
  COVER_THEME_LABELS,
  contrastRatio,
  coverSeed,
  coverThemeOf,
  displayTitle,
  JOURNAL_MOODS,
  moodIcon,
  NOTEBOOK_COLORS,
  NOTEBOOK_COVER_THEMES,
  NOTEBOOK_EMOJIS,
  notebookCoverArt,
  notebookCoverColors,
  notebookCoverTheme,
  notebookIcon,
  notebookIconOptions,
  PERIOD_MOODS,
  PET_SPECIES,
  PET_SPECIES_INFO,
  periodReminder,
  sameEmoji,
  UI_ICON_NAMES,
  workoutRoutine,
} from '../src/index.js';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('iconos en lugar de emojis', () => {
  it('cada ánimo guardado tiene su icono y el mismo nombre que la lista', () => {
    for (const m of [...JOURNAL_MOODS, ...PERIOD_MOODS]) expect(moodIcon(m.emoji)).toEqual({ icon: m.icon, label: m.label });
    expect(JOURNAL_MOODS.map((m) => m.icon)).toEqual(['Laugh', 'Smile', 'Meh', 'Frown', 'Angry', 'Bed']);
    // Lo guardado no cambia (lo lee la app anterior).
    expect(JOURNAL_MOODS.map((m) => m.emoji)).toEqual(['😄', '🙂', '😐', '😔', '😣', '😴']);
    expect(PERIOD_MOODS[0].emoji).toBe('😀');
  });

  it('un ánimo desconocido recibe un icono genérico y uno vacío, ninguno', () => {
    expect(moodIcon('🦄')).toEqual({ icon: 'Sparkles', label: 'Otro' });
    expect(moodIcon('😭')).toEqual({ icon: 'Frown', label: 'Bajo' });
    expect(moodIcon('')).toBeNull();
    expect(moodIcon(undefined)).toBeNull();
    expect(moodIcon(3)).toBeNull();
  });

  it('los 16 iconos de cuaderno son distintos, con nombre en español y sin emoji', () => {
    const options = notebookIconOptions(NOTEBOOK_EMOJIS[0]);
    expect(options.map((o) => o.value)).toEqual([...NOTEBOOK_EMOJIS]);
    expect(new Set(options.map((o) => o.icon)).size).toBe(16);
    expect(new Set(options.map((o) => o.label)).size).toBe(16);
    for (const o of options) expect(o.label).not.toMatch(EMOJI);
    expect(notebookIcon('🔬')).toEqual({ icon: 'Microscope', label: 'Microscopio' });
    expect(notebookIcon('🧮')).toEqual({ icon: 'Calculator', label: 'Calculadora' });
  });

  it('un emoji de cuaderno sin selector de variación es el mismo; uno desconocido se conserva como opción', () => {
    expect(notebookIcon('⚗')).toEqual(notebookIcon('⚗️'));
    expect(sameEmoji('✏', '✏️')).toBe(true);
    expect(notebookIconOptions('⚗')).toHaveLength(16);
    expect(notebookIcon('🦄')).toEqual({ icon: 'NotebookText', label: 'Otro icono' });
    expect(notebookIconOptions('🦄').at(-1)).toEqual({ value: '🦄', icon: 'NotebookText', label: 'Otro icono' });
    expect(notebookIcon('')).toEqual({ icon: 'Notebook', label: 'Cuaderno' });
  });

  it('las mascotas y los cuidados guardan su clave y se dibujan con un icono conocido', () => {
    for (const s of PET_SPECIES) expect(UI_ICON_NAMES).toContain(PET_SPECIES_INFO[s].icon);
    for (const k of CARE_KINDS) expect(UI_ICON_NAMES).toContain(CARE_KIND_INFO[k].icon);
    expect(PET_SPECIES_INFO.dog).toEqual({ label: 'Perro', icon: 'Dog' });
    expect(CARE_KIND_INFO.vet).toEqual({ label: 'Veterinario', icon: 'Stethoscope' });
  });

  it('los títulos generados ya no llevan emoji y los de antes se muestran sin él', () => {
    expect(periodReminder('r', '2026-10-24').title).toBe('Posible inicio del periodo');
    expect(workoutRoutine('o', 'Fuerza').title).toBe('Entreno: Fuerza');
    expect(displayTitle('🩸 Posible inicio del periodo')).toBe('Posible inicio del periodo');
    expect(displayTitle('🏋️ Entreno: Full body')).toBe('Entreno: Full body');
    expect(displayTitle('🏋 Entreno: Yoga')).toBe('Entreno: Yoga');
    expect(displayTitle('🏋️‍♀️ Entreno: Cardio')).toBe('Entreno: Cardio');
    // Lo que escribe la persona no se toca.
    expect(displayTitle('Cumple de Ana 🎂')).toBe('Cumple de Ana 🎂');
    expect(displayTitle('🎂 Cumple de Ana')).toBe('🎂 Cumple de Ana');
    expect(displayTitle('Donar 🩸')).toBe('Donar 🩸');
    expect(displayTitle(undefined)).toBe('');
  });
});

describe('portadas de cuaderno', () => {
  it('elige el tema por la materia, sin importar tildes ni mayúsculas', () => {
    const cases: Array<[string, string]> = [
      ['Cálculo', 'math'],
      ['MATEMÁTICAS II', 'math'],
      ['Álgebra lineal', 'math'],
      ['Estadística', 'math'],
      ['Física', 'physics'],
      ['Química', 'chemistry'],
      ['Bioquímica', 'chemistry'],
      ['Biología celular', 'biology'],
      ['Anatomía', 'biology'],
      ['Medicina', 'biology'],
      ['Programación', 'code'],
      ['Informática', 'code'],
      ['Lenguajes de programación', 'code'],
      ['C++', 'code'],
      ['Historia', 'history'],
      ['Filosofía', 'history'],
      ['Literatura', 'literature'],
      ['Inglés B2', 'literature'],
      ['Lengua castellana', 'literature'],
      ['Historia del arte', 'art'],
      ['Diseño gráfico', 'art'],
      ['Música', 'music'],
      ['Geografía', 'geography'],
      ['Economía', 'economy'],
      ['Finanzas personales', 'economy'],
      ['Recetas', 'cooking'],
      ['Cocina', 'cooking'],
    ];
    for (const [text, theme] of cases) expect([text, coverThemeOf(text)]).toEqual([text, theme]);
    expect(coverThemeOf('Artículos')).toBeNull();
    expect(coverThemeOf('')).toBeNull();
    expect(coverThemeOf(undefined)).toBeNull();
  });

  it('manda la materia; si no, el tema, el título y la categoría; si nada casa, abstracta', () => {
    expect(notebookCoverTheme({ subject: 'Física', title: 'Recetas' })).toBe('physics');
    expect(notebookCoverTheme({ subject: '', topic: 'Cenas rápidas', title: 'Mis cosas' })).toBe('cooking');
    expect(notebookCoverTheme({ subject: '', topic: '', title: 'Apuntes de química', category: 'General' })).toBe('chemistry');
    expect(notebookCoverTheme({ title: 'Cuaderno', category: 'Idiomas' })).toBe('literature');
    expect(notebookCoverTheme({ title: 'Cuaderno', category: 'General' })).toBe('abstract');
  });

  it('la misma portada para el mismo cuaderno y distinta entre cuadernos', () => {
    const a = notebookCoverArt({ id: 'nb1', title: 'Varios' }, 320, 150);
    expect(notebookCoverArt({ id: 'nb1', title: 'Varios' }, 320, 150)).toEqual(a);
    expect(notebookCoverArt({ id: 'nb2', title: 'Varios' }, 320, 150)).not.toEqual(a);
    expect(coverSeed('nb1')).toBe(coverSeed('nb1'));
    expect(coverSeed('nb1')).not.toBe(coverSeed('nb2'));
  });

  it('cada tema dibuja formas válidas dentro de un lienzo apaisado y otro vertical', () => {
    const subjects: Record<string, string> = { math: 'Cálculo', physics: 'Física', chemistry: 'Química', biology: 'Biología', code: 'Programación', history: 'Historia', literature: 'Literatura', art: 'Arte', music: 'Música', geography: 'Geografía', economy: 'Economía', cooking: 'Cocina', abstract: '' };
    expect(Object.keys(subjects)).toEqual([...NOTEBOOK_COVER_THEMES]);
    for (const theme of NOTEBOOK_COVER_THEMES) {
      expect(COVER_THEME_LABELS[theme]).toBeTruthy();
      for (const [w, h] of [
        [320, 150],
        [150, 200],
      ]) {
        const art = notebookCoverArt({ id: `x-${theme}`, subject: subjects[theme] }, w, h);
        expect(art.theme).toBe(theme);
        expect(art.spine).toBeGreaterThanOrEqual(8);
        expect(art.shapes.length).toBeGreaterThan(0);
        for (const s of art.shapes) {
          const numbers = s.kind === 'path' ? (s.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number) : s.kind === 'circle' ? [s.cx, s.cy, s.r] : [s.x, s.y, s.size];
          for (const n of numbers) expect(Number.isFinite(n)).toBe(true);
          if (s.kind === 'path') expect(s.d).toMatch(/^M/);
          const opacities = s.kind === 'text' ? [s.fill] : [s.stroke ?? 0, s.fill ?? 0];
          // Dibujo sutil: nunca tinta opaca.
          for (const o of opacities) expect(o).toBeLessThanOrEqual(0.85);
        }
      }
    }
  });

  it('la tinta de la portada contrasta con su color y la insignia con la tinta', () => {
    for (const color of [...NOTEBOOK_COLORS, '#FFD166', '#F1F3F5', '#000000']) {
      const c = notebookCoverColors(color);
      // El icono de la insignia es un gráfico: al menos 3:1 sobre su fondo.
      expect(contrastRatio(c.ink, c.badgeSolid)).toBeGreaterThanOrEqual(3);
      expect(c.top).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.bottom).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(notebookCoverColors('#111827').ink).toBe('#ffffff');
    expect(notebookCoverColors('#FFD166').ink).toBe('#17171c');
  });
});

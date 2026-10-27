/**
 * Iconos de línea (Lucide) para lo que la app anterior guarda como emoji.
 *
 * Los datos se comparten con la app anterior, así que lo GUARDADO no cambia:
 * el ánimo sigue siendo «😄», el icono del cuaderno sigue siendo «🧮», etc.
 * Aquí solo se decide cómo se DIBUJA cada valor: con el nombre de un icono de
 * Lucide (el mismo en lucide-react y lucide-react-native) y un nombre en
 * español para lectores de pantalla. Un emoji desconocido (guardado por la
 * app anterior) nunca se dibuja tal cual: recibe un icono genérico.
 */

/** Nombres de los iconos de Lucide que usan web y móvil en lugar de emojis. */
export const UI_ICON_NAMES = [
  // Ánimo
  'Laugh',
  'Smile',
  'Meh',
  'Frown',
  'Angry',
  'Bed',
  'Sparkles',
  // Mascotas y cuidados
  'Dog',
  'Cat',
  'Rabbit',
  'Rat',
  'Bird',
  'Fish',
  'Turtle',
  'Milk',
  'PiggyBank',
  'Egg',
  'Worm',
  'PawPrint',
  'Bone',
  'Droplet',
  'Footprints',
  'Stethoscope',
  // Cuadernos
  'Notebook',
  'Book',
  'BookText',
  'BookMarked',
  'NotebookPen',
  'Brain',
  'Microscope',
  'Calculator',
  'TriangleRight',
  'Globe',
  'Laptop',
  'Palette',
  'Music',
  'FlaskConical',
  'BookOpen',
  'Pencil',
  'Library',
  'GraduationCap',
  'Lightbulb',
  'TestTube',
  'NotebookText',
] as const;
export type UiIconName = (typeof UI_ICON_NAMES)[number];

/** Un valor guardado con su icono y su nombre para lectores de pantalla. */
export interface UiIcon {
  icon: UiIconName;
  label: string;
}

/**
 * Normaliza un emoji para compararlo: sin espacios, sin selectores de variación
 * (U+FE0E/U+FE0F) ni tonos de piel. «⚗️» y «⚗» son el mismo icono.
 */
export const normalizeEmoji = (value: unknown): string => (typeof value === 'string' ? value.trim().replace(/[︎️]|\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF}/gu, '') : '');

/** ¿Son el mismo emoji guardado (ignorando selectores de variación)? */
export const sameEmoji = (a: unknown, b: unknown): boolean => normalizeEmoji(a) === normalizeEmoji(b);

const byEmoji = (entries: Array<[string, UiIcon]>) => new Map(entries.map(([emoji, info]) => [normalizeEmoji(emoji), info]));

// ---------- Ánimo (Diario y Ciclo) ----------

const GENIAL: UiIcon = { icon: 'Laugh', label: 'Genial' };
const BIEN: UiIcon = { icon: 'Smile', label: 'Bien' };
const NORMAL: UiIcon = { icon: 'Meh', label: 'Normal' };
const BAJO: UiIcon = { icon: 'Frown', label: 'Bajo' };
const MAL: UiIcon = { icon: 'Angry', label: 'Mal' };
const CANSANCIO: UiIcon = { icon: 'Bed', label: 'Cansancio' };

/** Ánimo que no es de la lista (lo guardó la app anterior con otro emoji). */
export const UNKNOWN_MOOD_ICON: UiIcon = { icon: 'Sparkles', label: 'Otro' };

// Los seis de las listas y, por si la app anterior guardó otros, los parecidos.
const MOOD_ICONS = byEmoji([
  ['😄', GENIAL],
  ['😀', GENIAL],
  ['😁', GENIAL],
  ['😃', GENIAL],
  ['😆', GENIAL],
  ['🤩', GENIAL],
  ['🥳', GENIAL],
  ['😍', GENIAL],
  ['🥰', GENIAL],
  ['🙂', BIEN],
  ['😊', BIEN],
  ['☺️', BIEN],
  ['😌', BIEN],
  ['😐', NORMAL],
  ['😑', NORMAL],
  ['😶', NORMAL],
  ['🤔', NORMAL],
  ['😔', BAJO],
  ['😕', BAJO],
  ['🙁', BAJO],
  ['☹️', BAJO],
  ['😞', BAJO],
  ['😟', BAJO],
  ['😢', BAJO],
  ['😥', BAJO],
  ['😭', BAJO],
  ['😣', MAL],
  ['😖', MAL],
  ['😫', MAL],
  ['😩', MAL],
  ['😠', MAL],
  ['😡', MAL],
  ['🤬', MAL],
  ['😤', MAL],
  ['😴', CANSANCIO],
  ['🥱', CANSANCIO],
  ['😪', CANSANCIO],
]);

/** Icono y nombre de un ánimo guardado; `null` si no hay ánimo. */
export function moodIcon(mood: unknown): UiIcon | null {
  const key = normalizeEmoji(mood);
  if (!key) return null;
  return MOOD_ICONS.get(key) ?? UNKNOWN_MOOD_ICON;
}

// ---------- Icono de un cuaderno ----------

/** Cada emoji que ofrece el selector de Cuadernos, en el mismo orden que NOTEBOOK_EMOJIS. */
const NOTEBOOK_PICKER_ICONS: Array<[string, UiIcon]> = [
  ['📓', { icon: 'Notebook', label: 'Cuaderno' }],
  ['📕', { icon: 'Book', label: 'Libro' }],
  ['📗', { icon: 'BookText', label: 'Apuntes' }],
  ['📘', { icon: 'BookMarked', label: 'Marcapáginas' }],
  ['📙', { icon: 'NotebookPen', label: 'Libreta' }],
  ['🧠', { icon: 'Brain', label: 'Cerebro' }],
  ['🔬', { icon: 'Microscope', label: 'Microscopio' }],
  ['🧮', { icon: 'Calculator', label: 'Calculadora' }],
  ['📐', { icon: 'TriangleRight', label: 'Escuadra' }],
  ['🌍', { icon: 'Globe', label: 'Mundo' }],
  ['💻', { icon: 'Laptop', label: 'Portátil' }],
  ['🎨', { icon: 'Palette', label: 'Paleta' }],
  ['🎵', { icon: 'Music', label: 'Música' }],
  ['⚗️', { icon: 'FlaskConical', label: 'Matraz' }],
  ['📖', { icon: 'BookOpen', label: 'Libro abierto' }],
  ['✏️', { icon: 'Pencil', label: 'Lápiz' }],
];

const NOTEBOOK_ICONS = byEmoji([
  ...NOTEBOOK_PICKER_ICONS,
  // Otros que pudo guardar la app anterior.
  ['📚', { icon: 'Library', label: 'Libros' }],
  ['🎓', { icon: 'GraduationCap', label: 'Graduación' }],
  ['💡', { icon: 'Lightbulb', label: 'Idea' }],
  ['🧪', { icon: 'TestTube', label: 'Tubo de ensayo' }],
  ['🌎', { icon: 'Globe', label: 'Mundo' }],
  ['🌏', { icon: 'Globe', label: 'Mundo' }],
  ['🎶', { icon: 'Music', label: 'Música' }],
  ['📒', { icon: 'Notebook', label: 'Cuaderno' }],
  ['📔', { icon: 'Notebook', label: 'Cuaderno' }],
]);

/** Icono de un emoji que no es de la lista. */
export const UNKNOWN_NOTEBOOK_ICON: UiIcon = { icon: 'NotebookText', label: 'Otro icono' };

/** Icono y nombre del emoji guardado en un cuaderno (sin emoji, el de por defecto). */
export function notebookIcon(emoji: unknown): UiIcon {
  const key = normalizeEmoji(emoji);
  if (!key) return NOTEBOOK_PICKER_ICONS[0][1];
  return NOTEBOOK_ICONS.get(key) ?? UNKNOWN_NOTEBOOK_ICON;
}

/**
 * Opciones del selector de icono de un cuaderno: las 16 de siempre y, si el
 * cuaderno guarda otro emoji (de la app anterior), ese también, para no perderlo.
 * `value` es lo que se guarda, igual que antes.
 */
export function notebookIconOptions(current: unknown): Array<UiIcon & { value: string }> {
  const list = NOTEBOOK_PICKER_ICONS.map(([value, info]) => ({ value, ...info }));
  if (typeof current === 'string' && current.trim() && !list.some((o) => sameEmoji(o.value, current))) list.push({ value: current, ...notebookIcon(current) });
  return list;
}

// ---------- Títulos generados por la app ----------

// Emojis con los que la app (esta y la anterior) empezaba los títulos que crea ella sola.
const GENERATED_TITLE_PREFIX = /^(?:\u{1FA78}|\u{1F3CB}(?:️)?(?:‍[♀♂]️?)?)️?\s*/u;

/**
 * Título para mostrar: quita el emoji que la app ponía delante de los títulos
 * que genera («🩸 Posible inicio del periodo», «🏋️ Entreno: …»). Lo que escribe
 * la persona no se toca.
 */
export const displayTitle = (title: unknown): string => (typeof title === 'string' ? title.replace(GENERATED_TITLE_PREFIX, '') : '');

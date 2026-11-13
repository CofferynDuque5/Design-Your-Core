/**
 * Personajes propios de la app para la foto de perfil. Se dibujan con figuras
 * simples en una caja de 64 × 64 para que la web (SVG) y el teléfono
 * (react-native-svg) los pinten igual. Sin emojis: todo es dibujo.
 */

export type AvatarShape =
  | { el: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { el: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { el: 'path'; d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number };

export interface AvatarInfo {
  id: string;
  name: string;
  /** Color del fondo redondo. */
  bg: string;
  shapes: AvatarShape[];
}

const INK = '#10120C';
const LIME = '#C8F23A';
const CREAM = '#F3F4EF';
const SAND = '#E8C9A0';
const TERRA = '#D9825B';
const PINK = '#F2A7A0';
const BROWN = '#7A5A43';

/** Dos ojos redondos con brillo. */
const eyes = (x1: number, x2: number, y: number, r = 2.4): AvatarShape[] => [
  { el: 'circle', cx: x1, cy: y, r, fill: INK },
  { el: 'circle', cx: x2, cy: y, r, fill: INK },
  { el: 'circle', cx: x1 + r * 0.35, cy: y - r * 0.35, r: r * 0.32, fill: CREAM },
  { el: 'circle', cx: x2 + r * 0.35, cy: y - r * 0.35, r: r * 0.32, fill: CREAM },
];
const cheeks = (x1: number, x2: number, y: number): AvatarShape[] => [
  { el: 'circle', cx: x1, cy: y, r: 2, fill: PINK, opacity: 0.8 },
  { el: 'circle', cx: x2, cy: y, r: 2, fill: PINK, opacity: 0.8 },
];
const smile = (x: number, y: number, w = 3): AvatarShape => ({ el: 'path', d: `M${x - w} ${y} Q${x} ${y + w} ${x + w} ${y}`, stroke: INK, strokeWidth: 1.8, fill: 'none' });

export const AVATARS: readonly AvatarInfo[] = [
  {
    id: 'brote',
    name: 'Brote',
    bg: '#1F2712',
    shapes: [
      { el: 'ellipse', cx: 32, cy: 53, rx: 17, ry: 4.5, fill: TERRA },
      { el: 'path', d: 'M32 30 L32 19', stroke: LIME, strokeWidth: 3, fill: 'none' },
      { el: 'path', d: 'M32 21 C25 12 15 15 17 22 C21 25 28 24 32 21 Z', fill: LIME },
      { el: 'path', d: 'M32 19 C39 9 50 12 47 19 C43 23 36 22 32 19 Z', fill: LIME },
      { el: 'circle', cx: 32, cy: 39, r: 13, fill: LIME },
      ...eyes(27.5, 36.5, 38, 2.2),
      smile(32, 43, 2.8),
      ...cheeks(24.5, 39.5, 42.5),
    ],
  },
  {
    id: 'gato',
    name: 'Gato',
    bg: '#2B2E29',
    shapes: [
      { el: 'path', d: 'M17 31 L19 13 L31 23 Z', fill: TERRA },
      { el: 'path', d: 'M47 31 L45 13 L33 23 Z', fill: TERRA },
      { el: 'path', d: 'M20 26 L21 17 L27 22 Z', fill: PINK },
      { el: 'path', d: 'M44 26 L43 17 L37 22 Z', fill: PINK },
      { el: 'circle', cx: 32, cy: 37, r: 16, fill: TERRA },
      { el: 'ellipse', cx: 32, cy: 43, rx: 7, ry: 5, fill: CREAM },
      { el: 'ellipse', cx: 25.5, cy: 34, rx: 2.4, ry: 3.4, fill: INK },
      { el: 'ellipse', cx: 38.5, cy: 34, rx: 2.4, ry: 3.4, fill: INK },
      { el: 'circle', cx: 26.3, cy: 32.8, r: 0.8, fill: LIME },
      { el: 'circle', cx: 39.3, cy: 32.8, r: 0.8, fill: LIME },
      { el: 'path', d: 'M30.5 40 L33.5 40 L32 42 Z', fill: PINK },
      { el: 'path', d: 'M32 42 Q30.5 45 28.5 44 M32 42 Q33.5 45 35.5 44', stroke: INK, strokeWidth: 1.4, fill: 'none' },
      { el: 'path', d: 'M12 39 L22 41 M12 44 L22 43 M52 39 L42 41 M52 44 L42 43', stroke: CREAM, strokeWidth: 1.2, fill: 'none' },
    ],
  },
  {
    id: 'buho',
    name: 'Búho',
    bg: '#1A1D17',
    shapes: [
      { el: 'path', d: 'M17 22 L21 12 L26 20 Z M47 22 L43 12 L38 20 Z', fill: BROWN },
      { el: 'ellipse', cx: 32, cy: 37, rx: 17, ry: 18, fill: BROWN },
      { el: 'ellipse', cx: 32, cy: 46, rx: 10, ry: 8, fill: SAND },
      { el: 'circle', cx: 25, cy: 31, r: 7, fill: CREAM },
      { el: 'circle', cx: 39, cy: 31, r: 7, fill: CREAM },
      ...eyes(25, 39, 31, 3.2),
      { el: 'path', d: 'M30 37 L34 37 L32 41 Z', fill: LIME },
    ],
  },
  {
    id: 'zorro',
    name: 'Zorro',
    bg: '#23261F',
    shapes: [
      { el: 'path', d: 'M14 24 L20 9 L28 21 L36 21 L44 9 L50 24 Q50 44 32 53 Q14 44 14 24 Z', fill: TERRA },
      { el: 'path', d: 'M19 21 L21 14 L25 20 Z M45 21 L43 14 L39 20 Z', fill: INK },
      { el: 'path', d: 'M15 31 Q25 33 32 51 Q19 46 15 31 Z', fill: CREAM },
      { el: 'path', d: 'M49 31 Q39 33 32 51 Q45 46 49 31 Z', fill: CREAM },
      ...eyes(25, 39, 31, 2.3),
      { el: 'circle', cx: 32, cy: 47.5, r: 2.6, fill: INK },
    ],
  },
  {
    id: 'oso',
    name: 'Oso',
    bg: '#1F2712',
    shapes: [
      { el: 'circle', cx: 19, cy: 20, r: 6.5, fill: BROWN },
      { el: 'circle', cx: 45, cy: 20, r: 6.5, fill: BROWN },
      { el: 'circle', cx: 19, cy: 20, r: 3.2, fill: SAND },
      { el: 'circle', cx: 45, cy: 20, r: 3.2, fill: SAND },
      { el: 'circle', cx: 32, cy: 35, r: 17, fill: BROWN },
      { el: 'ellipse', cx: 32, cy: 42, rx: 8.5, ry: 6.5, fill: SAND },
      { el: 'ellipse', cx: 32, cy: 39, rx: 3.2, ry: 2.3, fill: INK },
      { el: 'path', d: 'M32 41 L32 43.5 M29 44.5 Q32 47 35 44.5', stroke: INK, strokeWidth: 1.6, fill: 'none' },
      ...eyes(25, 39, 32, 2.2),
      { el: 'path', d: 'M24 52 Q32 56 40 52', stroke: LIME, strokeWidth: 3, fill: 'none' },
    ],
  },
  {
    id: 'luna',
    name: 'Luna',
    bg: '#151714',
    shapes: [
      { el: 'path', d: 'M38 11 A22 22 0 1 0 53 43 A17 17 0 1 1 38 11 Z', fill: '#F2E3B3' },
      { el: 'path', d: 'M17 33 Q20 36 23 33', stroke: INK, strokeWidth: 1.8, fill: 'none' },
      { el: 'path', d: 'M20 41 Q23 43.5 26 41', stroke: INK, strokeWidth: 1.8, fill: 'none' },
      { el: 'circle', cx: 16, cy: 38, r: 1.9, fill: PINK, opacity: 0.8 },
      { el: 'path', d: 'M47 17 L48.2 20 L51 21 L48.2 22 L47 25 L45.8 22 L43 21 L45.8 20 Z', fill: LIME },
      { el: 'path', d: 'M52 30 L52.8 32 L55 33 L52.8 34 L52 36 L51.2 34 L49 33 L51.2 32 Z', fill: LIME },
      { el: 'circle', cx: 42, cy: 31, r: 1.2, fill: LIME },
    ],
  },
  {
    id: 'nube',
    name: 'Nube',
    bg: '#1A1D17',
    shapes: [
      { el: 'path', d: 'M18 46 A9 9 0 0 1 19 28 A12 12 0 0 1 42 24 A10 10 0 0 1 47 46 Z', fill: CREAM },
      ...eyes(27, 38, 37, 2.2),
      smile(32.5, 41, 2.6),
      ...cheeks(23.5, 41.5, 40.5),
      { el: 'path', d: 'M24 51 Q25.5 54 24 56 Q22.5 54 24 51 Z M33 52 Q34.5 55 33 57 Q31.5 55 33 52 Z M42 51 Q43.5 54 42 56 Q40.5 54 42 51 Z', fill: LIME },
    ],
  },
  {
    id: 'rana',
    name: 'Rana',
    bg: '#23261F',
    shapes: [
      { el: 'circle', cx: 22, cy: 25, r: 7.5, fill: '#93C23A' },
      { el: 'circle', cx: 42, cy: 25, r: 7.5, fill: '#93C23A' },
      { el: 'ellipse', cx: 32, cy: 39, rx: 19, ry: 13, fill: '#93C23A' },
      { el: 'circle', cx: 22, cy: 25, r: 4.6, fill: CREAM },
      { el: 'circle', cx: 42, cy: 25, r: 4.6, fill: CREAM },
      ...eyes(22, 42, 25, 2.3),
      { el: 'path', d: 'M22 41 Q32 49 42 41', stroke: INK, strokeWidth: 1.8, fill: 'none' },
      ...cheeks(19, 45, 40),
      { el: 'circle', cx: 29.5, cy: 35, r: 0.9, fill: INK },
      { el: 'circle', cx: 34.5, cy: 35, r: 0.9, fill: INK },
    ],
  },
  {
    id: 'conejo',
    name: 'Conejo',
    bg: '#1F2712',
    shapes: [
      { el: 'ellipse', cx: 25, cy: 17, rx: 4.8, ry: 12, fill: CREAM },
      { el: 'ellipse', cx: 39, cy: 17, rx: 4.8, ry: 12, fill: CREAM },
      { el: 'ellipse', cx: 25, cy: 18, rx: 2.2, ry: 8, fill: PINK },
      { el: 'ellipse', cx: 39, cy: 18, rx: 2.2, ry: 8, fill: PINK },
      { el: 'circle', cx: 32, cy: 39, r: 14.5, fill: CREAM },
      ...eyes(26.5, 37.5, 37, 2.2),
      { el: 'ellipse', cx: 32, cy: 42, rx: 1.8, ry: 1.3, fill: PINK },
      smile(32, 44.5, 2.6),
      ...cheeks(23.5, 40.5, 42),
    ],
  },
  {
    id: 'pinguino',
    name: 'Pingüino',
    bg: '#2B2E29',
    shapes: [
      { el: 'ellipse', cx: 32, cy: 36, rx: 17, ry: 19, fill: '#0A0B09' },
      { el: 'path', d: 'M32 27 C28 22 20 23 20 32 C20 44 26 52 32 52 C38 52 44 44 44 32 C44 23 36 22 32 27 Z', fill: CREAM },
      ...eyes(27, 37, 33, 2.1),
      { el: 'path', d: 'M29 38 L35 38 L32 42 Z', fill: '#F2B33A' },
      ...cheeks(24, 40, 39),
      { el: 'path', d: 'M20 50 Q32 46 44 50', stroke: LIME, strokeWidth: 4, fill: 'none' },
    ],
  },
];

export const AVATAR_IDS = AVATARS.map((a) => a.id);
export const avatarById = (id: string | null | undefined): AvatarInfo | null => AVATARS.find((a) => a.id === id) ?? null;

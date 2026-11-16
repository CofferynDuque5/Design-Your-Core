/**
 * Personajes propios de la app para la foto de perfil. Se dibujan con figuras
 * simples en una caja de 64 × 64 para que la web (SVG) y el teléfono
 * (react-native-svg) los pinten igual. Sin emojis: todo es dibujo.
 *
 * Estilo: retrato de busto (cabeza y hombros), recortado por el círculo del
 * fondo, con un halo suave detrás, luz arriba a la izquierda y sombra suave
 * abajo. Ojos grandes con dos brillos.
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
  /** Todo se dibuja recortado por el círculo del fondo. */
  shapes: AvatarShape[];
}

const INK = '#141610';
const WHITE = '#FFFFFF';
const CREAM = '#F6F3EA';
const LIME = '#C8F23A';
const LIME_DARK = '#9CC425';
const BLUSH = '#FF8F86';

/** Halo detrás del personaje: le da profundidad al fondo. */
const halo = (color: string): AvatarShape[] => [
  { el: 'circle', cx: 32, cy: 28, r: 25, fill: color, opacity: 0.16 },
  { el: 'circle', cx: 32, cy: 28, r: 17, fill: color, opacity: 0.14 },
];

/** Ojos grandes con dos brillos (el truco de los personajes tiernos). */
const eyes = (x1: number, x2: number, y: number, r = 3, color = INK): AvatarShape[] =>
  [x1, x2].flatMap((x): AvatarShape[] => [
    { el: 'ellipse', cx: x, cy: y, rx: r, ry: r * 1.12, fill: color },
    { el: 'circle', cx: x + r * 0.38, cy: y - r * 0.42, r: r * 0.4, fill: WHITE },
    { el: 'circle', cx: x - r * 0.35, cy: y + r * 0.45, r: r * 0.17, fill: WHITE, opacity: 0.85 },
  ]);

const cheeks = (x1: number, x2: number, y: number, r = 2.6): AvatarShape[] =>
  [x1, x2].map((cx): AvatarShape => ({ el: 'ellipse', cx, cy: y, rx: r, ry: r * 0.66, fill: BLUSH, opacity: 0.55 }));

const smile = (x: number, y: number, w = 2.8): AvatarShape => ({ el: 'path', d: `M${x - w} ${y} Q${x} ${y + w * 1.05} ${x + w} ${y}`, stroke: INK, strokeWidth: 1.6, fill: 'none' });

/** Boca de animalito: una «w» suave bajo la nariz. */
const muzzle = (x: number, y: number, w = 2.4): AvatarShape => ({
  el: 'path',
  d: `M${x} ${y - 1} L${x} ${y} M${x - w} ${y + 0.3} Q${x - w / 2} ${y + 2} ${x} ${y} Q${x + w / 2} ${y + 2} ${x + w} ${y + 0.3}`,
  stroke: INK,
  strokeWidth: 1.4,
  fill: 'none',
});

/** Brillo suave arriba a la izquierda de una forma redonda. */
const shine = (cx: number, cy: number, rx = 4.5, ry = 2.6): AvatarShape => ({ el: 'ellipse', cx, cy, rx, ry, fill: WHITE, opacity: 0.28 });

/** Hombros que salen por abajo del círculo. */
const shoulders = (fill: string, top = 50, width = 22): AvatarShape => ({
  el: 'path',
  d: `M${32 - width} 66 C${32 - width} ${top + 2} ${32 - width / 2} ${top} 32 ${top} C${32 + width / 2} ${top} ${32 + width} ${top + 2} ${32 + width} 66 Z`,
  fill,
});

/** Bufanda lima, el detalle de la marca. */
const scarf = (y: number, w = 13): AvatarShape[] => [
  { el: 'path', d: `M${32 - w} ${y} Q32 ${y + 5} ${32 + w} ${y} L${32 + w} ${y + 4.5} Q32 ${y + 9.5} ${32 - w} ${y + 4.5} Z`, fill: LIME },
  { el: 'path', d: `M${32 + w - 6} ${y + 5} L${32 + w - 1} ${y + 5} L${32 + w + 1} ${y + 14} L${32 + w - 4} ${y + 14} Z`, fill: LIME_DARK },
];

export const AVATARS: readonly AvatarInfo[] = [
  {
    id: 'brote',
    name: 'Brote',
    bg: '#1C2410',
    shapes: [
      ...halo(LIME),
      // Maceta
      { el: 'path', d: 'M17 53 L47 53 L44 66 L20 66 Z', fill: '#C96D47' },
      { el: 'path', d: 'M14 49.5 Q14 48 15.5 48 L48.5 48 Q50 48 50 49.5 L50 53.5 Q50 55 48.5 55 L15.5 55 Q14 55 14 53.5 Z', fill: '#E08A60' },
      { el: 'path', d: 'M16 50 L48 50', stroke: WHITE, strokeWidth: 1, opacity: 0.25, fill: 'none' },
      // Tallo y hojas
      { el: 'path', d: 'M32 24 Q31 18 33 13', stroke: LIME_DARK, strokeWidth: 2.4, fill: 'none' },
      { el: 'path', d: 'M33 15 C27 6 17 8 17.5 14.5 C22 18.5 29 18 33 15 Z', fill: LIME },
      { el: 'path', d: 'M33 15 C24 13.5 21 13 18.5 14', stroke: LIME_DARK, strokeWidth: 1, fill: 'none' },
      { el: 'path', d: 'M33 13 C38 4 49 5 48 11.5 C44 15.5 37 15.5 33 13 Z', fill: '#B4E030' },
      // Cabeza
      { el: 'ellipse', cx: 32, cy: 35, rx: 15.5, ry: 14, fill: LIME },
      { el: 'path', d: 'M17.5 38 Q20 48.5 32 49 Q44 48.5 46.5 38 Q42 45 32 45.5 Q22 45 17.5 38 Z', fill: LIME_DARK, opacity: 0.55 },
      shine(25, 27.5),
      ...eyes(26.5, 37.5, 35, 2.8),
      smile(32, 40.5, 2.6),
      ...cheeks(22.5, 41.5, 40),
    ],
  },
  {
    id: 'gato',
    name: 'Gato',
    bg: '#2A2118',
    shapes: [
      ...halo('#F2A65A'),
      shoulders('#E08A4A', 51),
      { el: 'path', d: 'M25 66 Q25 54 32 53 Q39 54 39 66 Z', fill: CREAM },
      // Orejas
      { el: 'path', d: 'M15 31 Q14 15 18.5 11 Q22 12 29 19 Z', fill: '#E08A4A' },
      { el: 'path', d: 'M49 31 Q50 15 45.5 11 Q42 12 35 19 Z', fill: '#E08A4A' },
      { el: 'path', d: 'M18 25 Q18 17 19.5 15 Q22 16.5 25 20 Z', fill: '#FFB7A8' },
      { el: 'path', d: 'M46 25 Q46 17 44.5 15 Q42 16.5 39 20 Z', fill: '#FFB7A8' },
      // Cabeza
      { el: 'ellipse', cx: 32, cy: 35, rx: 18, ry: 16, fill: '#F29A55' },
      { el: 'path', d: 'M28 20 L29 25 M32 19.5 L32 25.5 M36 20 L35 25', stroke: '#C46A2E', strokeWidth: 1.8, fill: 'none' },
      { el: 'path', d: 'M14.5 36 Q16 50 32 51 Q48 50 49.5 36 Q44 46.5 32 47 Q20 46.5 14.5 36 Z', fill: '#C46A2E', opacity: 0.35 },
      shine(23, 25.5, 4.2, 2.4),
      // Hocico
      { el: 'ellipse', cx: 32, cy: 42, rx: 6.5, ry: 4.6, fill: CREAM },
      ...eyes(24.5, 39.5, 34, 3.1),
      { el: 'path', d: 'M30.2 39.2 Q32 38.4 33.8 39.2 Q33 41 32 41.2 Q31 41 30.2 39.2 Z', fill: '#E86F6F' },
      muzzle(32, 42, 2.2),
      ...cheeks(21, 43, 40),
      { el: 'path', d: 'M10 38 L18 39.5 M10.5 43 L18 42 M54 38 L46 39.5 M53.5 43 L46 42', stroke: CREAM, strokeWidth: 1, opacity: 0.7, fill: 'none' },
    ],
  },
  {
    id: 'buho',
    name: 'Búho',
    bg: '#1B1A15',
    shapes: [
      ...halo('#E7C58C'),
      // Cuerpo y alas
      { el: 'ellipse', cx: 32, cy: 52, rx: 20, ry: 16, fill: '#8A6446' },
      { el: 'path', d: 'M12 50 Q11 62 18 66 L24 66 Q19 58 20 47 Z', fill: '#6E4D35' },
      { el: 'path', d: 'M52 50 Q53 62 46 66 L40 66 Q45 58 44 47 Z', fill: '#6E4D35' },
      { el: 'ellipse', cx: 32, cy: 56, rx: 10, ry: 10, fill: '#EBD3AE' },
      { el: 'path', d: 'M27.5 53 Q29 55 30.5 53 M33.5 53 Q35 55 36.5 53 M30 58 Q31.5 60 33 58 M27 61.5 Q28.5 63.5 30 61.5 M34 61.5 Q35.5 63.5 37 61.5', stroke: '#B08A62', strokeWidth: 1.2, fill: 'none' },
      // Cabeza
      { el: 'path', d: 'M15 22 Q14 13 18 10 Q22 14 25 18 Z M49 22 Q50 13 46 10 Q42 14 39 18 Z', fill: '#7A563B' },
      { el: 'ellipse', cx: 32, cy: 32, rx: 18, ry: 16, fill: '#9A7151' },
      shine(23, 22, 4.5, 2.4),
      // Antifaz
      { el: 'circle', cx: 24.5, cy: 31.5, r: 8, fill: '#F3E3C4' },
      { el: 'circle', cx: 39.5, cy: 31.5, r: 8, fill: '#F3E3C4' },
      { el: 'circle', cx: 24.5, cy: 31.5, r: 5, fill: '#F2B33A' },
      { el: 'circle', cx: 39.5, cy: 31.5, r: 5, fill: '#F2B33A' },
      ...eyes(24.5, 39.5, 31.5, 3.1),
      { el: 'path', d: 'M29.5 37 Q32 36 34.5 37 L32 42 Z', fill: '#E89A34' },
      ...cheeks(18.5, 45.5, 39, 2.2),
    ],
  },
  {
    id: 'zorro',
    name: 'Zorro',
    bg: '#22201A',
    shapes: [
      ...halo('#FF9A4D'),
      shoulders('#D96A2E', 52),
      { el: 'path', d: 'M23 66 Q24 55 32 54 Q40 55 41 66 Z', fill: CREAM },
      // Orejas
      { el: 'path', d: 'M13 30 Q11 12 16 7 Q22 9 29 19 Z', fill: '#E8773A' },
      { el: 'path', d: 'M51 30 Q53 12 48 7 Q42 9 35 19 Z', fill: '#E8773A' },
      { el: 'path', d: 'M16.5 23 Q16 13 18 10.5 Q22 13 25 18 Z', fill: '#3A2A20' },
      { el: 'path', d: 'M47.5 23 Q48 13 46 10.5 Q42 13 39 18 Z', fill: '#3A2A20' },
      // Cabeza
      { el: 'path', d: 'M13 31 Q13 17 32 17 Q51 17 51 31 Q51 41 32 52 Q13 41 13 31 Z', fill: '#F08540' },
      { el: 'path', d: 'M13.5 33 Q22 33 28 39 Q30.5 46 32 52 Q17 43 13.5 33 Z', fill: CREAM },
      { el: 'path', d: 'M50.5 33 Q42 33 36 39 Q33.5 46 32 52 Q47 43 50.5 33 Z', fill: CREAM },
      shine(22, 23, 4.5, 2.3),
      ...eyes(24, 40, 31, 2.8),
      { el: 'ellipse', cx: 32, cy: 46.5, rx: 3, ry: 2.2, fill: INK },
      { el: 'circle', cx: 31, cy: 45.8, r: 0.8, fill: WHITE, opacity: 0.8 },
      ...cheeks(19.5, 44.5, 37.5, 2.2),
    ],
  },
  {
    id: 'oso',
    name: 'Oso',
    bg: '#1C2410',
    shapes: [
      ...halo('#D9A57A'),
      shoulders('#8C5E3F', 51, 23),
      ...scarf(47, 14),
      // Orejas
      { el: 'circle', cx: 17.5, cy: 18.5, r: 7, fill: '#9C6B48' },
      { el: 'circle', cx: 46.5, cy: 18.5, r: 7, fill: '#9C6B48' },
      { el: 'circle', cx: 17.5, cy: 18.5, r: 3.6, fill: '#E2B48A' },
      { el: 'circle', cx: 46.5, cy: 18.5, r: 3.6, fill: '#E2B48A' },
      // Cabeza
      { el: 'ellipse', cx: 32, cy: 32, rx: 18, ry: 16.5, fill: '#A87452' },
      { el: 'path', d: 'M14.5 34 Q16 47.5 32 48.5 Q48 47.5 49.5 34 Q44 44.5 32 45 Q20 44.5 14.5 34 Z', fill: '#7A4F33', opacity: 0.4 },
      shine(23, 22.5, 4.5, 2.4),
      { el: 'ellipse', cx: 32, cy: 39, rx: 8.5, ry: 6.5, fill: '#EBC59E' },
      { el: 'path', d: 'M28.8 35.8 Q32 34.6 35.2 35.8 Q34.6 38.6 32 38.8 Q29.4 38.6 28.8 35.8 Z', fill: INK },
      muzzle(32, 40.2, 2.6),
      ...eyes(24.5, 39.5, 30.5, 2.7),
      ...cheeks(20, 44, 37),
    ],
  },
  {
    id: 'luna',
    name: 'Luna',
    bg: '#14161F',
    shapes: [
      ...halo('#F7E7AE'),
      // Luna creciente: un disco al que se le «muerde» un círculo del color del fondo.
      { el: 'circle', cx: 27, cy: 34, r: 19, fill: '#F7E7AE' },
      { el: 'path', d: 'M10 42 A19 19 0 0 0 44 42 A21 21 0 0 1 10 42 Z', fill: '#E2C97E', opacity: 0.8 },
      { el: 'circle', cx: 40, cy: 26, r: 15.5, fill: '#14161F' },
      // Estrellas
      { el: 'path', d: 'M50 13 L51.2 16.3 L54.5 17.5 L51.2 18.7 L50 22 L48.8 18.7 L45.5 17.5 L48.8 16.3 Z', fill: LIME },
      { el: 'path', d: 'M54 33 L54.8 35.2 L57 36 L54.8 36.8 L54 39 L53.2 36.8 L51 36 L53.2 35.2 Z', fill: LIME },
      { el: 'circle', cx: 45, cy: 28, r: 1.2, fill: LIME },
      { el: 'circle', cx: 13, cy: 17, r: 1, fill: CREAM, opacity: 0.7 },
      { el: 'circle', cx: 47, cy: 48, r: 0.9, fill: CREAM, opacity: 0.7 },
      { el: 'circle', cx: 14, cy: 25, r: 2, fill: '#E2C97E', opacity: 0.8 },
      { el: 'circle', cx: 26, cy: 48, r: 1.5, fill: '#E2C97E', opacity: 0.8 },
      shine(15, 30, 2.4, 3.6),
      // Cara dormida
      { el: 'path', d: 'M13 35 Q15.5 38 18 35.5 M21.5 40 Q24 42.5 26.5 39.6', stroke: INK, strokeWidth: 1.6, fill: 'none' },
      { el: 'path', d: 'M17.5 45 Q19.5 46.5 21.5 45', stroke: INK, strokeWidth: 1.5, fill: 'none' },
      ...cheeks(12.5, 28.5, 41, 2),
      // Zzz
      { el: 'path', d: 'M42 34 L46 34 L42 38 L46 38 M48 27 L51 27 L48 30 L51 30', stroke: CREAM, strokeWidth: 1.3, opacity: 0.8, fill: 'none' },
    ],
  },
  {
    id: 'nube',
    name: 'Nube',
    bg: '#16201C',
    shapes: [
      ...halo('#BFE8FF'),
      // Sol detrás
      { el: 'circle', cx: 44, cy: 20, r: 9, fill: LIME },
      { el: 'path', d: 'M44 6 L44 8.5 M55.5 11 L53.5 13 M58 20 L55.5 20 M33 11 L35 13', stroke: LIME, strokeWidth: 2, fill: 'none' },
      // Nube
      { el: 'path', d: 'M16 47 Q8 47 8.5 39.5 Q9 32.5 17 32 Q17.5 21 29 20.5 Q38 20.5 41 28 Q49 26.5 52 33 Q57 34 56.5 40.5 Q56 47 49 47 Z', fill: CREAM },
      { el: 'path', d: 'M9 41 Q10 47 16 47 L49 47 Q56 47 56.5 41 Q53 44.5 47 44.5 L17 44.5 Q11 44.5 9 41 Z', fill: '#C9D4DC' },
      shine(23, 27, 4.5, 2.3),
      ...eyes(26, 39, 36, 2.7),
      smile(32.5, 40.5, 2.6),
      ...cheeks(21.5, 43.5, 40),
      // Gotas
      { el: 'path', d: 'M22 51 Q24.5 55 22 57 Q19.5 55 22 51 Z M32 53 Q34.5 57 32 59 Q29.5 57 32 53 Z M42 51 Q44.5 55 42 57 Q39.5 55 42 51 Z', fill: '#8FD3FF' },
    ],
  },
  {
    id: 'rana',
    name: 'Rana',
    bg: '#18200F',
    shapes: [
      ...halo(LIME),
      shoulders('#6FA82C', 52, 22),
      { el: 'ellipse', cx: 32, cy: 62, rx: 11, ry: 8, fill: '#D9EFA0' },
      // Ojos saltones
      { el: 'circle', cx: 21, cy: 22, r: 8.5, fill: '#86C23A' },
      { el: 'circle', cx: 43, cy: 22, r: 8.5, fill: '#86C23A' },
      // Cabeza
      { el: 'ellipse', cx: 32, cy: 38, rx: 20, ry: 13.5, fill: '#86C23A' },
      { el: 'path', d: 'M12.5 40 Q15 51 32 51.5 Q49 51 51.5 40 Q46 47.5 32 48 Q18 47.5 12.5 40 Z', fill: '#5E9425', opacity: 0.6 },
      shine(19, 18, 3.2, 1.8),
      shine(41, 18, 3.2, 1.8),
      { el: 'circle', cx: 21, cy: 22.5, r: 5.4, fill: WHITE },
      { el: 'circle', cx: 43, cy: 22.5, r: 5.4, fill: WHITE },
      ...eyes(21.8, 42.2, 23, 3),
      { el: 'circle', cx: 29.5, cy: 35, r: 0.9, fill: '#3E6418' },
      { el: 'circle', cx: 34.5, cy: 35, r: 0.9, fill: '#3E6418' },
      { el: 'path', d: 'M21 40 Q32 48.5 43 40', stroke: INK, strokeWidth: 1.7, fill: 'none' },
      ...cheeks(18, 46, 40, 2.8),
      { el: 'circle', cx: 22, cy: 31, r: 1.3, fill: '#5E9425', opacity: 0.7 },
      { el: 'circle', cx: 44, cy: 33, r: 1.6, fill: '#5E9425', opacity: 0.7 },
    ],
  },
  {
    id: 'conejo',
    name: 'Conejo',
    bg: '#1F1B22',
    shapes: [
      ...halo('#F4D9E8'),
      shoulders('#E9E2DA', 52, 21),
      // Orejas (una doblada)
      { el: 'path', d: 'M20 27 Q15 14 18 5 Q24 3 27 12 Q29 20 28 25 Z', fill: '#F3EEE8' },
      { el: 'path', d: 'M21.5 24 Q18.5 15 20 8 Q23.5 7 25 13 Q26.5 19 25.8 23 Z', fill: '#FFC2CC' },
      { el: 'path', d: 'M36 25 Q37 13 43 8 Q48 7 52 12 Q49 15 44 16 Q41 19 40 27 Z', fill: '#F3EEE8' },
      { el: 'path', d: 'M38.6 23 Q39.5 15 43.5 11 Q46.5 10 48.5 12.3 Q45 13.8 42.5 15 Q40.6 18.5 40.3 23.5 Z', fill: '#FFC2CC' },
      // Cabeza
      { el: 'ellipse', cx: 32, cy: 37, rx: 16.5, ry: 15, fill: '#F7F3EE' },
      { el: 'path', d: 'M15.8 39 Q18 51 32 52 Q46 51 48.2 39 Q43 48 32 48.5 Q21 48 15.8 39 Z', fill: '#D9CFC5', opacity: 0.7 },
      shine(25, 28, 4.5, 2.4),
      ...eyes(25.5, 38.5, 36, 2.9),
      { el: 'path', d: 'M30.4 41.2 Q32 40.4 33.6 41.2 Q33 42.8 32 43 Q31 42.8 30.4 41.2 Z', fill: '#F2879A' },
      muzzle(32, 44, 2.1),
      { el: 'path', d: 'M30.6 45 L30.6 47 Q32 47.6 33.4 47 L33.4 45', fill: WHITE, stroke: '#D9CFC5', strokeWidth: 0.6 },
      ...cheeks(21, 43, 42),
    ],
  },
  {
    id: 'pinguino',
    name: 'Pingüino',
    bg: '#17202A',
    shapes: [
      ...halo('#9FD8FF'),
      shoulders('#20242B', 50, 22),
      { el: 'ellipse', cx: 32, cy: 63, rx: 12, ry: 10, fill: CREAM },
      // Gorro
      { el: 'path', d: 'M15 26 Q15 9 32 9 Q49 9 49 26 Z', fill: LIME },
      { el: 'path', d: 'M14 23.5 L50 23.5 L50 28.5 L14 28.5 Z', fill: LIME_DARK },
      { el: 'path', d: 'M20 15 L20 22 M26 11.5 L26 22 M32 10.5 L32 22 M38 11.5 L38 22 M44 15 L44 22', stroke: LIME_DARK, strokeWidth: 1.2, opacity: 0.8, fill: 'none' },
      { el: 'circle', cx: 32, cy: 7, r: 4, fill: CREAM },
      // Cabeza
      { el: 'path', d: 'M14 29 L50 29 Q51 46 32 50 Q13 46 14 29 Z', fill: '#2A2F37' },
      { el: 'path', d: 'M32 33 C28 28.5 18.5 29 18.5 37 C18.5 44 25 48.5 32 48.5 C39 48.5 45.5 44 45.5 37 C45.5 29 36 28.5 32 33 Z', fill: CREAM },
      ...eyes(26, 38, 37, 2.6),
      { el: 'path', d: 'M29 41.5 Q32 40 35 41.5 Q33.5 44.5 32 44.8 Q30.5 44.5 29 41.5 Z', fill: '#F5A623' },
      ...cheeks(22, 42, 42, 2.2),
    ],
  },
  {
    id: 'abeja',
    name: 'Abeja',
    bg: '#211E12',
    shapes: [
      ...halo('#FFD84D'),
      // Alas
      { el: 'ellipse', cx: 14, cy: 45, rx: 8, ry: 6, fill: '#DDF3FF', opacity: 0.85 },
      { el: 'ellipse', cx: 50, cy: 45, rx: 8, ry: 6, fill: '#DDF3FF', opacity: 0.85 },
      // Cuerpo con rayas
      { el: 'path', d: 'M12 66 C12 52 20 48 32 48 C44 48 52 52 52 66 Z', fill: '#FFC93C' },
      { el: 'path', d: 'M14 56 Q32 50 50 56 L51 61 Q32 55 13 61 Z', fill: '#2A2418' },
      // Antenas
      { el: 'path', d: 'M26 19 Q23 10 18 8 M38 19 Q41 10 46 8', stroke: '#2A2418', strokeWidth: 1.8, fill: 'none' },
      { el: 'circle', cx: 18, cy: 8, r: 2.6, fill: '#2A2418' },
      { el: 'circle', cx: 46, cy: 8, r: 2.6, fill: '#2A2418' },
      // Cabeza
      { el: 'circle', cx: 32, cy: 33, r: 16, fill: '#FFD45C' },
      { el: 'path', d: 'M16.5 36 Q18 49 32 49 Q46 49 47.5 36 Q43 45.5 32 46 Q21 45.5 16.5 36 Z', fill: '#E0A52A', opacity: 0.55 },
      shine(25, 24, 4.6, 2.4),
      ...eyes(26, 38, 33, 2.9),
      smile(32, 39, 2.6),
      ...cheeks(21.5, 42.5, 38.5),
    ],
  },
  {
    id: 'ajolote',
    name: 'Ajolote',
    bg: '#22171D',
    shapes: [
      ...halo('#FFB3C7'),
      shoulders('#F7A8BE', 52, 21),
      { el: 'ellipse', cx: 32, cy: 62, rx: 10, ry: 8, fill: '#FFD3DF' },
      // Branquias
      { el: 'path', d: 'M15 28 Q6 22 5 15 Q11 17 16 23 Z M14 34 Q4 32 1.5 26 Q8 26 14 30 Z M16 40 Q7 42 3 38 Q9 35 16 37 Z', fill: '#F06A92' },
      { el: 'path', d: 'M49 28 Q58 22 59 15 Q53 17 48 23 Z M50 34 Q60 32 62.5 26 Q56 26 50 30 Z M48 40 Q57 42 61 38 Q55 35 48 37 Z', fill: '#F06A92' },
      // Cabeza
      { el: 'ellipse', cx: 32, cy: 35, rx: 18.5, ry: 15, fill: '#FFB8CB' },
      { el: 'path', d: 'M13.8 37 Q16 50 32 50.5 Q48 50 50.2 37 Q45 46.5 32 47 Q19 46.5 13.8 37 Z', fill: '#E88AA5', opacity: 0.55 },
      shine(24, 25.5, 5, 2.5),
      ...eyes(24, 40, 34, 2.6),
      { el: 'path', d: 'M26 41 Q32 45.5 38 41', stroke: INK, strokeWidth: 1.6, fill: 'none' },
      ...cheeks(19.5, 44.5, 40, 2.8),
      { el: 'circle', cx: 30, cy: 22, r: 1.2, fill: '#F06A92', opacity: 0.6 },
      { el: 'circle', cx: 35, cy: 24, r: 0.9, fill: '#F06A92', opacity: 0.6 },
    ],
  },
];

export const AVATAR_IDS = AVATARS.map((a) => a.id);
export const avatarById = (id: string | null | undefined): AvatarInfo | null => AVATARS.find((a) => a.id === id) ?? null;

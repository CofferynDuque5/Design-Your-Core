/**
 * Portadas de los Cuadernos: un dibujo de línea sutil según la materia
 * (cuadrícula con ∫ y Σ para Cálculo, órbitas para Física, una molécula para
 * Química…), sobre el color del cuaderno y con el lomo a la izquierda.
 *
 * Todo es puro y sin dependencias: aquí se elige el tema y se calculan las
 * formas (trazos, círculos y glifos) en un lienzo de `width` × `height`; la web
 * las dibuja con SVG y el móvil con react-native-svg. Nada de esto se guarda:
 * el cuaderno sigue teniendo solo su color y su emoji, como en la app anterior.
 */

export const NOTEBOOK_COVER_THEMES = ['math', 'physics', 'chemistry', 'biology', 'code', 'history', 'literature', 'art', 'music', 'geography', 'economy', 'cooking', 'abstract'] as const;
export type NotebookCoverTheme = (typeof NOTEBOOK_COVER_THEMES)[number];

/** Nombre de cada tema (para pruebas y documentación; la portada es decorativa). */
export const COVER_THEME_LABELS: Record<NotebookCoverTheme, string> = {
  math: 'Matemáticas',
  physics: 'Física',
  chemistry: 'Química',
  biology: 'Biología',
  code: 'Programación',
  history: 'Historia',
  literature: 'Letras',
  art: 'Arte',
  music: 'Música',
  geography: 'Geografía',
  economy: 'Economía',
  cooking: 'Cocina',
  abstract: 'General',
};

// Palabras (sin tildes, en minúscula) que eligen cada tema. Por defecto casan por
// el principio de la palabra («matemat» → «matemáticas»); con «=» delante, solo
// la palabra exacta («=arte» no casa con «artesanal»… ni con «artículo»).
// El orden importa: «Bioquímica» es Química antes que Biología y «Lenguajes de
// programación» es Programación antes que Letras.
const THEME_WORDS: Array<[NotebookCoverTheme, string[]]> = [
  ['code', ['programa', 'informat', 'codigo', '=code', 'coding', 'software', 'javascript', 'typescript', '=js', '=ts', 'python', '=java', 'kotlin', '=swift', '=c', '=c++', '=c#', '=php', 'react', 'algoritm', 'computa', 'computer', '=sql', '=datos', '=web', 'frontend', 'backend', '=html', '=css', '=git', 'devops', 'linux', '=redes', 'ciberseg', 'artificial', 'developer', 'desarrollador']],
  ['chemistry', ['quimic', 'bioquim', 'fisicoquim', 'molecul', 'laborator', 'farmac', 'chemi', '=reacciones', 'estequiom']],
  ['math', ['matemat', '=mate', '=mates', '=math', 'maths', 'calculo', 'precalculo', 'calculus', 'algebra', 'estadist', 'geometr', 'trigonom', 'aritmet', 'probabil', 'integral', 'derivad', 'ecuacion', 'logaritm', 'matric', 'vector', 'numer']],
  ['physics', ['fisica', 'physic', 'mecanica', 'optica', 'termodin', 'electromag', 'electric', 'magnet', 'cuantic', 'astronom', 'astrofis', '=ondas', 'relativ', 'nuclear', 'cinematica', '=dinamica']],
  ['biology', ['biolog', 'medicin', 'anatom', 'fisiolog', 'genetic', 'botanic', 'zoolog', 'ecolog', 'celul', 'enfermer', '=salud', 'neuro', 'microbio', 'histolog', 'inmunol', 'embriolog', 'veterinar', 'odontolog', 'biology', 'plantas']],
  ['music', ['music', 'piano', 'guitarr', 'solfeo', 'armonia', '=canto', 'violin', '=coro', 'composic', 'orquesta', 'partitur', 'ritmo']],
  ['art', ['=arte', '=artes', '=art', 'artistic', 'diseno', 'design', 'dibujo', 'pintur', 'ilustrac', 'fotograf', 'escultur', 'arquitect', '=moda', 'acuarel', 'caligraf', 'ceramic', '=cine', 'teatro', 'animacion']],
  ['literature', ['literat', 'lengua', 'idioma', 'ingles', 'english', 'frances', 'french', 'aleman', 'german', 'italian', 'portugu', 'japones', 'chino', 'coreano', 'espanol', 'castellano', 'gramatic', 'redacc', 'escritura', 'poesia', 'poema', 'novela', 'lectur', '=latin', 'griego', 'linguist', 'traducc', 'ortograf', 'vocabul', '=libro', '=libros', 'cuento', 'ensayo', 'periodism']],
  ['geography', ['geograf', 'geolog', 'cartograf', '=clima', 'climatolog', 'meteorolog', '=mapa', '=mapas', 'oceanog', 'turismo', '=viaje', '=viajes', 'territori']],
  ['economy', ['econom', 'finanz', 'financ', 'empres', 'contab', 'negocio', 'marketing', 'mercadotec', '=inversion', '=inversiones', '=dinero', '=ventas', 'emprend', 'gestion', 'presupuest', 'banca', 'administr', 'comercio', '=bolsa']],
  ['history', ['histori', 'filosof', '=etica', 'arqueolog', 'mitolog', '=derecho', '=leyes', 'juridic', '=civica', 'sociolog', 'antropolog', 'religion', 'teolog', 'politic', 'humanidad']],
  ['cooking', ['cocin', 'receta', 'reposter', 'panader', 'gastronom', 'postre', '=cena', '=cenas', 'nutric', '=comida', '=comidas', 'desayun', '=almuerzo', '=menu', '=menus', '=dieta']],
];

/** Texto sin tildes y en minúscula, partido en palabras («C++» y «C#» se conservan). */
const words = (text: unknown): string[] =>
  typeof text === 'string'
    ? text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9+#]+/)
        .filter(Boolean)
    : [];

/** Tema de un texto suelto («Cálculo diferencial» → math), o `null` si no casa con ninguno. */
export function coverThemeOf(text: unknown): NotebookCoverTheme | null {
  const list = words(text);
  if (list.length === 0) return null;
  for (const [theme, keys] of THEME_WORDS) {
    for (const key of keys) {
      const hit = key.startsWith('=') ? list.includes(key.slice(1)) : list.some((w) => w.startsWith(key));
      if (hit) return theme;
    }
  }
  return null;
}

/** Tema de la portada de un cuaderno: manda la materia, luego el tema, el título y la categoría. */
export function notebookCoverTheme(n: { subject?: unknown; topic?: unknown; title?: unknown; category?: unknown }): NotebookCoverTheme {
  for (const field of [n.subject, n.topic, n.title, n.category]) {
    const theme = coverThemeOf(field);
    if (theme) return theme;
  }
  return 'abstract';
}

/** Semilla estable a partir del id (FNV-1a): el mismo cuaderno siempre tiene la misma portada. */
export function coverSeed(id: unknown): number {
  const text = typeof id === 'string' ? id : String(id ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------- Colores ----------

const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0x4f7cff;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const rgbHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return rgbHex(x.map((v, i) => v + (y[i] - v) * t));
};

/** Luminancia relativa (WCAG) de un color #RRGGBB. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores #RRGGBB (de 1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface NotebookCoverColors {
  /** Degradado de la portada, de arriba a la izquierda a abajo a la derecha. */
  top: string;
  bottom: string;
  /** Color de los trazos y del icono (blanco sobre colores oscuros; casi negro sobre claros). */
  ink: string;
  /** Fondo translúcido de la insignia del icono, que asegura ≥ 3:1 con `ink`. */
  badge: string;
  /** Color sólido de la insignia sobre `bottom` (para comprobar el contraste). */
  badgeSolid: string;
}

/** Colores de la portada a partir del color del cuaderno. */
export function notebookCoverColors(color: string): NotebookCoverColors {
  const base = rgbHex(hexRgb(color));
  const top = mix(base, '#ffffff', 0.1);
  const bottom = mix(base, '#000000', 0.3);
  const light = relativeLuminance(base) > 0.42;
  const ink = light ? '#17171c' : '#ffffff';
  const badgeSolid = light ? mix(bottom, '#ffffff', 0.5) : mix(bottom, '#000000', 0.3);
  const badge = light ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)';
  return { top, bottom, ink, badge, badgeSolid };
}

// ---------- Formas ----------

/**
 * Una forma de la portada. `stroke` y `fill` son opacidades del color de tinta
 * (0 a 1); los trazos son redondeados.
 */
export type CoverShape =
  | { kind: 'path'; d: string; stroke?: number; fill?: number; width?: number; dash?: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; stroke?: number; fill?: number; width?: number }
  | { kind: 'text'; x: number; y: number; text: string; size: number; fill: number; font: 'serif' | 'mono'; italic?: boolean; anchor?: 'start' | 'middle' | 'end' };

export interface NotebookCoverArt {
  theme: NotebookCoverTheme;
  width: number;
  height: number;
  /** Ancho del lomo, a la izquierda. */
  spine: number;
  shapes: CoverShape[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const pt = (x: number, y: number) => `${r1(x)} ${r1(y)}`;

/** Generador pseudoaleatorio con semilla (mulberry32). */
function random(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Curva suave (Catmull-Rom) que pasa por los puntos. */
function smooth(points: Array<[number, number]>, closed = false): string {
  const n = points.length;
  if (n < 2) return '';
  const at = (i: number) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${pt(...points[0])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += `C${pt(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)} ${pt(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)} ${pt(...p2)}`;
  }
  return closed ? `${d}Z` : d;
}

/** Elipse girada `deg` grados, como trazo. */
function ellipse(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    pts.push([cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
  }
  return smooth(pts, true);
}

const line = (x1: number, y1: number, x2: number, y2: number) => `M${pt(x1, y1)}L${pt(x2, y2)}`;

interface Box {
  /** Zona de dibujo, a la derecha del lomo. */
  x0: number;
  w: number;
  h: number;
  /** Medida de referencia: el lado corto. */
  u: number;
  /** ¿Más ancha que alta? */
  wide: boolean;
  rnd: () => number;
  seed: number;
}

type Painter = (b: Box) => CoverShape[];

const pick = <T>(b: Box, list: readonly T[]): T => list[Math.floor(b.rnd() * list.length) % list.length];

// Matemáticas: cuadrícula fina, una curva y un par de glifos.
const math: Painter = (b) => {
  const { x0, w, h, u } = b;
  const g = u / 8;
  let grid = '';
  for (let x = x0 + g; x < w; x += g) grid += line(x, 0, x, h);
  for (let y = g; y < h; y += g) grid += line(x0, y, w, y);
  const amp = h * 0.16;
  const mid = h * (b.wide ? 0.62 : 0.66);
  const phase = b.rnd() * Math.PI;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    const x = x0 + ((w - x0) * i) / 24;
    pts.push([x, mid - amp * Math.sin(phase + (i / 24) * Math.PI * 1.6) - (i / 24) * h * 0.1]);
  }
  const [big, small] = pick(b, [
    ['∫', 'π'],
    ['Σ', '√'],
    ['∫', 'Σ'],
    ['π', '∞'],
  ] as const);
  const dot = pts[16];
  return [
    { kind: 'path', d: grid, stroke: 0.09, width: 0.6 },
    { kind: 'path', d: smooth(pts), stroke: 0.55, width: 1.5 },
    { kind: 'circle', cx: dot[0], cy: dot[1], r: u * 0.025, fill: 0.7 },
    { kind: 'text', x: w - u * 0.14, y: h * (b.wide ? 0.52 : 0.4), text: big, size: u * 0.56, fill: 0.3, font: 'serif', italic: true, anchor: 'end' },
    { kind: 'text', x: x0 + u * 0.16, y: h * 0.34, text: small, size: u * 0.2, fill: 0.26, font: 'serif', italic: true, anchor: 'start' },
  ];
};

// Física: órbitas alrededor de un núcleo y una onda suave detrás.
const physics: Painter = (b) => {
  const { x0, w, h, u } = b;
  const cx = b.wide ? x0 + (w - x0) * 0.7 : x0 + (w - x0) * 0.58;
  const cy = h * (b.wide ? 0.5 : 0.42);
  const rx = u * 0.42;
  const ry = u * 0.14;
  const tilt = b.rnd() * 30;
  const shapes: CoverShape[] = [];
  let wave = '';
  for (let k = 0; k < 2; k++) {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 30; i++) {
      const x = x0 + ((w - x0) * i) / 30;
      pts.push([x, h * (0.8 + k * 0.08) + Math.sin((i / 30) * Math.PI * 4 + k) * h * 0.035]);
    }
    wave += smooth(pts);
  }
  shapes.push({ kind: 'path', d: wave, stroke: 0.16, width: 1 });
  for (const deg of [0, 60, 120]) shapes.push({ kind: 'path', d: ellipse(cx, cy, rx, ry, deg + tilt), stroke: 0.42, width: 1.1 });
  shapes.push({ kind: 'circle', cx, cy, r: u * 0.05, fill: 0.65 });
  shapes.push({ kind: 'circle', cx, cy, r: u * 0.085, stroke: 0.25, width: 0.8 });
  for (const [deg, t] of [
    [0, 0.3],
    [60, 2.2],
    [120, 4.1],
  ] as const) {
    const a = ((deg + tilt) * Math.PI) / 180;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    shapes.push({ kind: 'circle', cx: cx + x * Math.cos(a) - y * Math.sin(a), cy: cy + x * Math.sin(a) + y * Math.cos(a), r: u * 0.022, fill: 0.8 });
  }
  return shapes;
};

// Química: panal muy tenue y una molécula de anillos fusionados.
const chemistry: Painter = (b) => {
  const { x0, w, h, u } = b;
  const hex = (cx: number, cy: number, r: number) => {
    let d = '';
    for (let i = 0; i <= 6; i++) {
      const a = ((60 * i - 30) * Math.PI) / 180;
      d += `${i ? 'L' : 'M'}${pt(cx + r * Math.cos(a), cy + r * Math.sin(a))}`;
    }
    return d;
  };
  const vertex = (cx: number, cy: number, r: number, i: number): [number, number] => {
    const a = ((60 * i - 30) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  // Panal de fondo.
  const R = u * 0.1;
  const dx = Math.sqrt(3) * R;
  let comb = '';
  for (let row = 0, y = 0; y < h + R; row++, y += R * 1.5) for (let x = x0 + (row % 2 ? dx / 2 : 0); x < w + dx; x += dx) comb += hex(x, y, R);
  // Molécula: tres anillos (fenantreno) y dos enlaces con su átomo.
  const r = u * 0.15;
  const c0: [number, number] = b.wide ? [x0 + (w - x0) * 0.52, h * 0.6] : [x0 + (w - x0) * 0.32, h * 0.52];
  const c1: [number, number] = [c0[0] + Math.sqrt(3) * r, c0[1]];
  const c2: [number, number] = [c1[0] + (Math.sqrt(3) / 2) * r, c1[1] - 1.5 * r];
  const rings = [c0, c1, c2];
  const mol = rings.map(([x, y]) => hex(x, y, r)).join('');
  let inner = '';
  for (const [x, y] of [c0, c2])
    for (const i of [0, 2, 4]) {
      const p = vertex(x, y, r * 0.72, i);
      const q = vertex(x, y, r * 0.72, i + 1);
      inner += line(...p, ...q);
    }
  const shapes: CoverShape[] = [
    { kind: 'path', d: comb, stroke: 0.07, width: 0.7 },
    { kind: 'path', d: mol, stroke: 0.55, width: 1.4 },
    { kind: 'path', d: inner, stroke: 0.4, width: 1 },
  ];
  // Sustituyentes.
  for (const [[x, y], i] of [
    [c0, 3],
    [c2, 5],
  ] as const) {
    const a = vertex(x, y, r, i);
    const ang = Math.atan2(a[1] - y, a[0] - x);
    const e: [number, number] = [a[0] + Math.cos(ang) * r * 0.85, a[1] + Math.sin(ang) * r * 0.85];
    shapes.push({ kind: 'path', d: line(...a, ...e), stroke: 0.55, width: 1.4 });
    shapes.push({ kind: 'circle', cx: e[0] + Math.cos(ang) * u * 0.035, cy: e[1] + Math.sin(ang) * u * 0.035, r: u * 0.035, stroke: 0.6, width: 1.2 });
  }
  return shapes;
};

// Biología: una hoja grande con nervios y unas células.
const biology: Painter = (b) => {
  const { x0, w, h, u } = b;
  const L = u * 0.95;
  const base: [number, number] = b.wide ? [x0 + (w - x0) * 0.56, h * 0.98] : [x0 + (w - x0) * 0.3, h * 0.9];
  const ang = (-50 - b.rnd() * 15) * (Math.PI / 180);
  const dir = (t: number, off: number): [number, number] => {
    // Punto a la distancia t·L por el nervio, desplazado `off` en perpendicular.
    const x = base[0] + Math.cos(ang) * t * L - Math.sin(ang) * off;
    const y = base[1] + Math.sin(ang) * t * L + Math.cos(ang) * off;
    return [x, y];
  };
  const half = L * 0.24;
  const edge = (side: 1 | -1) => [0.08, 0.3, 0.55, 0.78, 0.93].map((t): [number, number] => dir(t, side * half * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - t * 0.25)));
  const leaf = smooth([dir(0.02, 0), ...edge(1), dir(1, 0), ...edge(-1).reverse(), dir(0.02, 0)]);
  let veins = line(...dir(-0.08, 0), ...dir(0.97, 0));
  for (const t of [0.22, 0.4, 0.58, 0.74]) {
    const s = half * Math.sin(Math.PI * t) * 0.85;
    veins += `M${pt(...dir(t, 0))}Q${pt(...dir(t + 0.1, s * 0.5))} ${pt(...dir(t + 0.16, s))}`;
    veins += `M${pt(...dir(t, 0))}Q${pt(...dir(t + 0.1, -s * 0.5))} ${pt(...dir(t + 0.16, -s))}`;
  }
  const cells: CoverShape[] = [];
  const spots: Array<[number, number, number]> = b.wide
    ? [
        [0.14, 0.3, 0.13],
        [0.3, 0.62, 0.08],
        [0.9, 0.24, 0.1],
      ]
    : [
        [0.72, 0.16, 0.12],
        [0.84, 0.44, 0.07],
      ];
  for (const [fx, fy, fr] of spots) {
    const cx = x0 + (w - x0) * fx;
    const cy = h * fy;
    cells.push({ kind: 'circle', cx, cy, r: u * fr, stroke: 0.3, width: 1 });
    cells.push({ kind: 'circle', cx: cx + u * fr * 0.25, cy: cy - u * fr * 0.15, r: u * fr * 0.34, fill: 0.2 });
  }
  return [...cells, { kind: 'path', d: leaf, stroke: 0.55, width: 1.4, fill: 0.08 }, { kind: 'path', d: veins, stroke: 0.38, width: 1 }];
};

// Programación: líneas de código como un minimapa, un cursor y unas llaves.
const code: Painter = (b) => {
  const { x0, w, h, u } = b;
  const step = u * 0.105;
  const indent = [0, 1, 2, 2, 1, 2, 0, 1];
  const lens = [0.46, 0.34, 0.4, 0.26, 0.3, 0.2, 0.36, 0.28];
  const shift = Math.floor(b.rnd() * indent.length);
  const left = x0 + u * 0.14;
  const room = (w - x0) * (b.wide ? 0.62 : 0.78);
  let bars = '';
  let dots = '';
  let cursor: CoverShape | null = null;
  let y = h * (b.wide ? 0.2 : 0.44);
  // Hasta el 78 % del alto: abajo a la izquierda va la insignia del icono.
  for (let i = 0; y < h * 0.78; i++, y += step) {
    const k = (i + shift) % indent.length;
    const x = left + indent[k] * u * 0.07;
    const len = room * lens[k];
    if (k === 3) dots += line(x, y, x + len, y);
    else bars += line(x, y, x + len, y);
    if (i === 3) cursor = { kind: 'path', d: `M${pt(x + len + u * 0.04, y - step * 0.36)}L${pt(x + len + u * 0.04, y + step * 0.36)}`, stroke: 0.8, width: 1.6 };
  }
  const glyph = pick(b, ['{ }', '</>', '( )'] as const);
  return [
    { kind: 'path', d: bars, stroke: 0.26, width: u * 0.03 },
    { kind: 'path', d: dots, stroke: 0.3, width: u * 0.028, dash: `0.1 ${r1(u * 0.06)}` },
    ...(cursor ? [cursor] : []),
    { kind: 'text', x: w - u * 0.1, y: b.wide ? h * 0.58 : h * 0.3, text: glyph, size: u * (b.wide ? 0.36 : 0.26), fill: 0.34, font: 'mono', anchor: 'end' },
  ];
};

// Historia: una columna clásica y una greca abajo.
const history: Painter = (b) => {
  const { x0, w, h, u } = b;
  const cw = u * 0.26;
  const cx = b.wide ? x0 + (w - x0) * 0.74 : x0 + (w - x0) * 0.6;
  const top = h * 0.14;
  const bottom = h * 0.76;
  const l = cx - cw / 2;
  const r = cx + cw / 2;
  let col = '';
  // Ábaco, equino con volutas, fuste estriado y basa.
  col += `M${pt(l - cw * 0.28, top)}H${r1(r + cw * 0.28)}V${r1(top + u * 0.035)}H${r1(l - cw * 0.28)}Z`;
  col += `M${pt(l - cw * 0.12, top + u * 0.035)}Q${pt(cx, top + u * 0.1)} ${pt(r + cw * 0.12, top + u * 0.035)}`;
  const shaftTop = top + u * 0.085;
  const shaftBottom = bottom - u * 0.06;
  col += line(l, shaftTop, l + cw * 0.04, shaftBottom) + line(r, shaftTop, r - cw * 0.04, shaftBottom);
  for (const f of [0.25, 0.5, 0.75]) col += line(l + cw * f, shaftTop + u * 0.02, l + cw * f, shaftBottom - u * 0.02);
  col += `M${pt(l - cw * 0.1, shaftBottom)}H${r1(r + cw * 0.1)}V${r1(shaftBottom + u * 0.03)}H${r1(l - cw * 0.1)}Z`;
  col += `M${pt(l - cw * 0.22, shaftBottom + u * 0.03)}H${r1(r + cw * 0.22)}V${r1(bottom)}H${r1(l - cw * 0.22)}Z`;
  const volutes: CoverShape[] = [
    { kind: 'circle', cx: l - cw * 0.12, cy: top + u * 0.06, r: u * 0.025, stroke: 0.5, width: 1 },
    { kind: 'circle', cx: r + cw * 0.12, cy: top + u * 0.06, r: u * 0.025, stroke: 0.5, width: 1 },
  ];
  // Greca (meandro griego) a lo ancho, abajo.
  const s = u * 0.07;
  const gy = h - s * 1.9;
  let key = line(x0, gy - s * 0.35, w, gy - s * 0.35) + line(x0, gy + s * 1.35, w, gy + s * 1.35);
  for (let x = x0 + s * 0.4; x + s * 1.2 < w; x += s * 1.6) key += `M${pt(x, gy + s)}V${r1(gy)}H${r1(x + s)}V${r1(gy + s * 0.66)}H${r1(x + s * 0.4)}V${r1(gy + s * 0.33)}`;
  return [{ kind: 'path', d: key, stroke: 0.24, width: 0.9 }, { kind: 'path', d: col, stroke: 0.5, width: 1.1 }, ...volutes];
};

// Letras: renglones como un párrafo y unas comillas grandes.
const literature: Painter = (b) => {
  const { x0, w, h, u } = b;
  const left = x0 + u * 0.14;
  const right = b.wide ? x0 + (w - x0) * 0.62 : w - u * 0.14;
  const step = u * 0.085;
  const startY = b.wide ? h * 0.3 : h * 0.5;
  let rules = '';
  let n = 0;
  for (let y = startY; y < h * 0.78; y += step, n++) {
    const end = n % 4 === 3 ? left + (right - left) * (0.35 + ((n * 7) % 5) * 0.06) : right - ((n * 13) % 4) * u * 0.03;
    if (n % 4 !== 0 || n === 0) rules += line(left + (n % 4 === 0 ? u * 0.08 : 0), y, end, y);
    else {
      y += step * 0.4;
      rules += line(left + u * 0.08, y, right, y);
    }
  }
  return [
    { kind: 'path', d: rules, stroke: 0.3, width: 1 },
    { kind: 'text', x: w - u * 0.12, y: b.wide ? h * 0.72 : h * 0.44, text: '“', size: u * 0.8, fill: 0.34, font: 'serif', anchor: 'end' },
  ];
};

// Arte: pinceladas amplias con un círculo y un triángulo (composición tipo Bauhaus).
const art: Painter = (b) => {
  const { x0, w, h, u } = b;
  const W = w - x0;
  const f = (fx: number, fy: number): [number, number] => [x0 + W * fx, h * fy];
  const s1 = smooth([f(0.06, 0.78), f(0.3, 0.6), f(0.55, 0.7), f(0.8, 0.45), f(1.02, 0.5)]);
  const s2 = smooth([f(0.2, 0.28), f(0.42, 0.18), f(0.66, 0.3)]);
  const [cx, cy] = b.wide ? f(0.78, 0.32) : f(0.66, 0.26);
  const t: Array<[number, number]> = b.wide ? [f(0.24, 0.92), f(0.36, 0.66), f(0.48, 0.92)] : [f(0.18, 0.95), f(0.34, 0.8), f(0.5, 0.95)];
  return [
    { kind: 'path', d: s1, stroke: 0.22, width: u * 0.11 },
    { kind: 'path', d: s2, stroke: 0.16, width: u * 0.07 },
    { kind: 'circle', cx, cy, r: u * 0.17, stroke: 0.55, width: 1.3 },
    { kind: 'circle', cx: cx - u * 0.05, cy: cy + u * 0.05, r: u * 0.06, fill: 0.5 },
    { kind: 'path', d: `M${pt(...t[0])}L${pt(...t[1])}L${pt(...t[2])}Z`, stroke: 0.45, width: 1.1 },
  ];
};

// Música: pentagrama ondulado con unas notas.
const music: Painter = (b) => {
  const { x0, w, h, u } = b;
  const gap = u * 0.06;
  const mid = h * (b.wide ? 0.5 : 0.46);
  const amp = h * 0.06;
  const phase = b.rnd() * Math.PI;
  const yAt = (x: number, k: number) => mid + (k - 2) * gap + Math.sin(phase + ((x - x0) / (w - x0)) * Math.PI * 1.4) * amp;
  let staff = '';
  for (let k = 0; k < 5; k++) {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 20; i++) {
      const x = x0 + ((w - x0) * i) / 20;
      pts.push([x, yAt(x, k)]);
    }
    staff += smooth(pts);
  }
  const shapes: CoverShape[] = [{ kind: 'path', d: staff, stroke: 0.34, width: 0.9 }];
  const notes: Array<[number, number]> = [
    [0.3, 3],
    [0.44, 1.5],
    [0.58, 2],
    [0.72, 0.5],
    [0.84, 1],
  ];
  let stems = '';
  const tops: Array<[number, number]> = [];
  for (const [fx, pos] of notes) {
    const x = x0 + (w - x0) * fx;
    const y = yAt(x, pos);
    shapes.push({ kind: 'path', d: ellipse(x, y, gap * 0.72, gap * 0.5, -22), fill: 0.7, stroke: 0.7, width: 0.6 });
    const sx = x + gap * 0.62;
    stems += line(sx, y - gap * 0.2, sx, y - gap * 3.4);
    tops.push([sx, y - gap * 3.4]);
  }
  // Una corchea doble entre la segunda y la tercera nota.
  const beam = `M${pt(...tops[1])}L${pt(...tops[2])}L${pt(tops[2][0], tops[2][1] + gap * 0.5)}L${pt(tops[1][0], tops[1][1] + gap * 0.5)}Z`;
  shapes.push({ kind: 'path', d: stems, stroke: 0.6, width: 1 }, { kind: 'path', d: beam, fill: 0.6 });
  return shapes;
};

// Geografía: curvas de nivel alrededor de una cima.
const geography: Painter = (b) => {
  const { x0, w, h, u } = b;
  const cx = x0 + (w - x0) * (b.wide ? 0.66 + b.rnd() * 0.1 : 0.55);
  const cy = h * (0.42 + b.rnd() * 0.12);
  const p1 = b.rnd() * Math.PI * 2;
  const p2 = b.rnd() * Math.PI * 2;
  const shapes: CoverShape[] = [];
  for (let k = 0; k < 9; k++) {
    const R = u * (0.07 + k * 0.1);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 36; i++) {
      const t = (i / 36) * Math.PI * 2;
      const rr = R * (1 + 0.16 * Math.sin(3 * t + p1 + k * 0.2) + 0.08 * Math.sin(5 * t + p2));
      pts.push([cx + rr * Math.cos(t) * 1.25, cy + rr * Math.sin(t)]);
    }
    shapes.push({ kind: 'path', d: smooth(pts, true), stroke: k % 4 === 0 ? 0.42 : 0.24, width: k % 4 === 0 ? 1.2 : 0.8 });
  }
  shapes.push({ kind: 'circle', cx, cy, r: u * 0.022, fill: 0.7 });
  return shapes;
};

// Economía: barras que suben con su línea de tendencia.
const economy: Painter = (b) => {
  const { x0, w, h, u } = b;
  const n = 5;
  const areaL = b.wide ? x0 + (w - x0) * 0.4 : x0 + u * 0.16;
  const areaR = w - u * 0.14;
  const base = h * 0.84;
  const bw = ((areaR - areaL) / n) * 0.5;
  let bars = '';
  const tops: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const x = areaL + ((areaR - areaL) / n) * (i + 0.25);
    const bh = h * (0.14 + i * 0.11 + (i === 2 ? -0.05 : 0) + b.rnd() * 0.03);
    const rr = Math.min(bw / 2, u * 0.03);
    bars += `M${pt(x, base)}V${r1(base - bh + rr)}Q${pt(x, base - bh)} ${pt(x + rr, base - bh)}H${r1(x + bw - rr)}Q${pt(x + bw, base - bh)} ${pt(x + bw, base - bh + rr)}V${r1(base)}Z`;
    tops.push([x + bw / 2, base - bh - h * 0.1]);
  }
  const shapes: CoverShape[] = [
    { kind: 'path', d: line(x0 + u * 0.1, base, w - u * 0.06, base), stroke: 0.35, width: 1 },
    { kind: 'path', d: bars, fill: 0.14, stroke: 0.32, width: 0.9 },
    { kind: 'path', d: smooth(tops), stroke: 0.65, width: 1.5 },
  ];
  for (const [x, y] of tops) shapes.push({ kind: 'circle', cx: x, cy: y, r: u * 0.022, fill: 0.85 });
  return shapes;
};

// Cocina: un plato con cubiertos y una ramita.
const cooking: Painter = (b) => {
  const { x0, w, h, u } = b;
  const cx = b.wide ? x0 + (w - x0) * 0.62 : x0 + (w - x0) * 0.5;
  const cy = h * (b.wide ? 0.52 : 0.44);
  const R = u * (b.wide ? 0.3 : 0.25);
  const shapes: CoverShape[] = [
    { kind: 'circle', cx, cy, r: R, stroke: 0.5, width: 1.2 },
    { kind: 'circle', cx, cy, r: R * 0.74, stroke: 0.28, width: 0.9 },
  ];
  // Tenedor a la izquierda y cuchara a la derecha.
  const fx = cx - R - u * (b.wide ? 0.14 : 0.1);
  const t0 = cy - R * 0.9;
  let fork = line(fx, t0 + u * 0.18, fx, cy + R * 0.95);
  for (const dx of [-0.04, 0, 0.04]) fork += line(fx + u * dx, t0, fx + u * dx, t0 + u * 0.12);
  fork += `M${pt(fx - u * 0.04, t0 + u * 0.12)}Q${pt(fx, t0 + u * 0.2)} ${pt(fx + u * 0.04, t0 + u * 0.12)}`;
  const sx = cx + R + u * (b.wide ? 0.14 : 0.1);
  const spoon = `${ellipse(sx, t0 + u * 0.08, u * 0.045, u * 0.075, 0)}${line(sx, t0 + u * 0.155, sx, cy + R * 0.95)}`;
  shapes.push({ kind: 'path', d: fork + spoon, stroke: 0.5, width: 1.2 });
  // Dos hojas de albahaca sobre el plato.
  const leaf = (bx: number, by: number, deg: number, len: number) => {
    const a = (deg * Math.PI) / 180;
    const at = (t: number, off: number): [number, number] => [bx + Math.cos(a) * t * len - Math.sin(a) * off, by + Math.sin(a) * t * len + Math.cos(a) * off];
    const wd = len * 0.3;
    return smooth([at(0, 0), at(0.35, wd), at(0.75, wd * 0.6), at(1, 0), at(0.75, -wd * 0.6), at(0.35, -wd)], true) + line(...at(0, 0), ...at(0.8, 0));
  };
  shapes.push({ kind: 'path', d: leaf(cx - R * 0.1, cy + R * 0.2, -35, R * 0.7) + leaf(cx - R * 0.1, cy + R * 0.2, -105, R * 0.55), stroke: 0.6, width: 1.1, fill: 0.16 });
  if (b.wide) shapes.push({ kind: 'path', d: line(x0 + u * 0.12, h * 0.9, w - u * 0.12, h * 0.9), stroke: 0.14, width: 0.8, dash: `${r1(u * 0.02)} ${r1(u * 0.04)}` });
  return shapes;
};

// Por defecto: arcos concéntricos desde una esquina que depende del cuaderno.
const abstract: Painter = (b) => {
  const { x0, w, h, u } = b;
  const corners: Array<[number, number]> = [
    [w, h],
    [w, 0],
    [x0 + (w - x0) * 0.72, h * 1.05],
    [w * 1.02, h * 0.5],
  ];
  const [cx, cy] = corners[b.seed % corners.length];
  const gap = u * (0.075 + b.rnd() * 0.03);
  const shapes: CoverShape[] = [];
  const rings = 11;
  for (let k = 1; k <= rings; k++) {
    const r = gap * k * 1.15;
    const strong = k % 3 === 0;
    shapes.push({ kind: 'circle', cx, cy, r, stroke: strong ? 0.4 : 0.18, width: strong ? 1.3 : 0.8 });
  }
  shapes.push({ kind: 'circle', cx, cy, r: gap * 0.8, fill: 0.22 });
  return shapes;
};

const PAINTERS: Record<NotebookCoverTheme, Painter> = { math, physics, chemistry, biology, code, history, literature, art, music, geography, economy, cooking, abstract };

/**
 * Portada de un cuaderno en un lienzo de `width` × `height`. Mismo cuaderno,
 * misma portada; si cambia la materia, cambia el dibujo.
 */
export function notebookCoverArt(n: { id?: unknown; subject?: unknown; topic?: unknown; title?: unknown; category?: unknown }, width: number, height: number): NotebookCoverArt {
  const theme = notebookCoverTheme(n);
  const seed = coverSeed(n.id);
  const spine = Math.max(8, Math.round(Math.min(width, height) * 0.075));
  const box: Box = { x0: spine, w: width, h: height, u: Math.min(width, height), wide: width > height * 1.2, rnd: random(seed), seed };
  return { theme, width, height, spine, shapes: PAINTERS[theme](box) };
}

/**
 * Design tokens de Design Your Core.
 *
 * Única fuente de verdad del sistema de diseño: de aquí salen las variables
 * CSS de la web (dist/tokens.css) y el tema de la app móvil (import directo).
 * Base neutra de piedra con acentos naturales: azul profundo (primario),
 * salvia, arena y terracota.
 */

export type ThemeName = 'light' | 'dark';

export interface ColorScheme {
  /** Fondo de la página. */
  bg: string;
  /** Superficie de tarjetas y paneles. */
  surface: string;
  /** Superficie hundida: campos, pistas de progreso, zonas secundarias. */
  surfaceSunken: string;
  /** Superficie elevada (menús, diálogos). */
  surfaceRaised: string;
  /** Texto principal. */
  ink: string;
  /** Texto secundario. */
  inkMuted: string;
  /** Texto terciario: leyendas, metadatos. */
  inkSubtle: string;
  /** Bordes y separadores. */
  line: string;
  /** Borde con más presencia (campos, foco suave). */
  lineStrong: string;
  /** Acción principal: azul profundo. */
  primary: string;
  primaryHover: string;
  /** Texto o icono sobre `primary`. */
  onPrimary: string;
  primarySoft: string;
  /** Acentos naturales. */
  sage: string;
  sageSoft: string;
  sand: string;
  sandSoft: string;
  terracotta: string;
  terracottaSoft: string;
  /** Estados. */
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  /** Anillo de foco visible (accesibilidad). */
  focus: string;
  /** Velo detrás de diálogos. */
  scrim: string;
}

export const color: Record<ThemeName, ColorScheme> = {
  light: {
    bg: '#F4F3EF',
    surface: '#FFFFFF',
    surfaceSunken: '#ECEAE4',
    surfaceRaised: '#FFFFFF',
    ink: '#1B2230',
    inkMuted: '#4A5263',
    inkSubtle: '#5E6572',
    line: '#DDDAD2',
    lineStrong: '#C3BFB5',
    primary: '#1E3A5F',
    primaryHover: '#152C4A',
    onPrimary: '#FFFFFF',
    primarySoft: '#E2E8F0',
    sage: '#50705A',
    sageSoft: '#E3EBE4',
    sand: '#C9B28C',
    sandSoft: '#F1EADC',
    terracotta: '#A9573A',
    terracottaSoft: '#F4E2D9',
    success: '#3C7350',
    successSoft: '#E0EDE4',
    warning: '#8A6116',
    warningSoft: '#F5EBD6',
    danger: '#AE3D2C',
    dangerSoft: '#F7E1DC',
    focus: '#2F6FB5',
    scrim: 'rgba(20, 24, 32, 0.45)',
  },
  dark: {
    bg: '#111418',
    surface: '#181C22',
    surfaceSunken: '#0D1014',
    surfaceRaised: '#20252D',
    ink: '#ECE8E1',
    inkMuted: '#BDB9B1',
    inkSubtle: '#9A9891',
    line: '#2A3039',
    lineStrong: '#3C4450',
    primary: '#9DB9E0',
    primaryHover: '#B6CCEA',
    onPrimary: '#0E1A2B',
    primarySoft: '#1E2A3A',
    sage: '#A3C1A9',
    sageSoft: '#1D2A22',
    sand: '#D9C6A5',
    sandSoft: '#2A251C',
    terracotta: '#E39C80',
    terracottaSoft: '#33221B',
    success: '#8CC7A0',
    successSoft: '#18291F',
    warning: '#E2BD72',
    warningSoft: '#2E2615',
    danger: '#F0A092',
    dangerSoft: '#34201C',
    focus: '#8DB8F0',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
};

export type PillarId = 'movimiento' | 'descanso' | 'alimentacion' | 'enfoque' | 'relaciones' | 'proposito';

export interface Pillar {
  id: PillarId;
  /** Nombre completo, como aparece en títulos. */
  name: string;
  /** Nombre corto para chips y leyendas. */
  short: string;
  /** Qué abarca el pilar, en una frase. */
  description: string;
  /** Texto, etiquetas e iconos (≥4.5:1 sobre fondo y tarjetas). */
  color: Record<ThemeName, string>;
  /** Fondo suave de etiquetas y zonas del pilar. */
  soft: Record<ThemeName, string>;
  /**
   * Marcas de gráficos: barras, anillos, líneas (≥3:1 sobre tarjetas). Más
   * saturado que `color` para que los seis se distingan, también con daltonismo.
   */
  chart: Record<ThemeName, string>;
  /** Icono de Lucide (lucide-react / lucide-react-native). */
  icon: string;
}

/**
 * Los seis pilares ("cores"). El orden es el de presentación en toda la
 * interfaz: gráficos, leyendas y navegación lo respetan.
 */
export const pillars: readonly Pillar[] = [
  {
    id: 'movimiento',
    name: 'Energía y movimiento',
    short: 'Movimiento',
    description: 'Actividad física, pasos, entrenamiento y cómo se siente tu energía durante el día.',
    color: { light: '#974A2E', dark: '#E39C80' },
    soft: { light: '#F4E2D9', dark: '#33221B' },
    chart: { light: '#B85C37', dark: '#D3754F' },
    icon: 'activity',
  },
  {
    id: 'descanso',
    name: 'Descanso',
    short: 'Descanso',
    description: 'Sueño, pausas y recuperación.',
    color: { light: '#2E4D78', dark: '#98B3DC' },
    soft: { light: '#E1E7F0', dark: '#1D2838' },
    chart: { light: '#2B5C97', dark: '#4B7CBA' },
    icon: 'moon',
  },
  {
    id: 'alimentacion',
    name: 'Alimentación',
    short: 'Alimentación',
    description: 'Comidas, hidratación y la relación con lo que comes.',
    color: { light: '#4C6D55', dark: '#A3C1A9' },
    soft: { light: '#E3EBE4', dark: '#1D2A22' },
    chart: { light: '#298B68', dark: '#44A781' },
    icon: 'leaf',
  },
  {
    id: 'enfoque',
    name: 'Enfoque mental',
    short: 'Enfoque',
    description: 'Concentración, estado de ánimo, estrés y espacio mental.',
    color: { light: '#85621F', dark: '#DDBA78' },
    soft: { light: '#F3EAD6', dark: '#2D2617' },
    chart: { light: '#BC8C30', dark: '#A27825' },
    icon: 'target',
  },
  {
    id: 'relaciones',
    name: 'Relaciones',
    short: 'Relaciones',
    description: 'Tiempo de calidad con pareja, familia y amistades.',
    color: { light: '#9A5064', dark: '#DDA0AF' },
    soft: { light: '#F4E1E5', dark: '#33202A' },
    chart: { light: '#C1657C', dark: '#D1748F' },
    icon: 'heart',
  },
  {
    id: 'proposito',
    name: 'Propósito personal',
    short: 'Propósito',
    description: 'Metas, valores, aprendizaje y reflexión.',
    color: { light: '#5F5086', dark: '#B7A9DA' },
    soft: { light: '#E9E5F2', dark: '#26223A' },
    chart: { light: '#634590', dark: '#7A5DA9' },
    icon: 'compass',
  },
];

export const font = {
  /** Titulares editoriales. */
  display: "'Newsreader', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  /** Interfaz y lectura. */
  sans: "'Figtree', 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif",
  /** Nombres de familia sin pila, para React Native (expo-google-fonts). */
  native: {
    display: 'Newsreader',
    sans: 'Figtree',
  },
} as const;

/** Escala tipográfica en px (base 16). */
export const fontSize = {
  caption: 12,
  small: 14,
  body: 16,
  lead: 18,
  title: 20,
  h3: 24,
  h2: 32,
  h1: 44,
  display: 60,
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeight = {
  tight: 1.1,
  snug: 1.25,
  normal: 1.5,
  relaxed: 1.65,
} as const;

export const letterSpacing = {
  display: '-0.02em',
  normal: '0',
  label: '0.08em',
} as const;

/** Espaciado en px (múltiplos de 4). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

/** Radios en px. Contenidos a propósito: el tono es editorial, no de juguete. */
export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const shadow: Record<ThemeName, { sm: string; md: string; lg: string }> = {
  light: {
    sm: '0 1px 2px rgba(27, 34, 48, 0.06)',
    md: '0 2px 4px rgba(27, 34, 48, 0.04), 0 8px 24px rgba(27, 34, 48, 0.07)',
    lg: '0 4px 8px rgba(27, 34, 48, 0.05), 0 24px 56px rgba(27, 34, 48, 0.12)',
  },
  dark: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0 2px 4px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35)',
    lg: '0 4px 8px rgba(0, 0, 0, 0.3), 0 24px 56px rgba(0, 0, 0, 0.5)',
  },
};

export const motion = {
  duration: { fast: 120, base: 200, slow: 320 },
  easing: {
    standard: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

/** Puntos de corte en px (mobile first). */
export const breakpoint = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

/** Tamaño mínimo de objetivos táctiles (WCAG 2.5.8 / guías de iOS y Android). */
export const touchTarget = 44;

export function pillarById(id: PillarId): Pillar {
  const p = pillars.find((x) => x.id === id);
  if (!p) throw new Error(`Pilar desconocido: ${id}`);
  return p;
}

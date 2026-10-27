import { NOTEBOOK_COLORS, notebookCoverArt, notebookCoverColors, notebookIcon, safeColor, type CoverShape, type LegacyNotebook } from '@dyc/core';
import { useId, useMemo, type CSSProperties } from 'react';
import { UiIcon } from './UiIcon';

// Lienzos de la portada: apaisada en las tarjetas y vertical, como un cuaderno, en la cabecera.
const SIZES = { card: [320, 150], hero: [150, 200] } as const;
const SERIF = 'var(--font-stack-clasica-display, Georgia, serif)';
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

/**
 * Portada de un cuaderno: el color del cuaderno en degradado, el lomo a la
 * izquierda, un dibujo de línea según la materia y su icono en una insignia.
 * Es decorativa (aria-hidden): el nombre accesible es el título del cuaderno.
 */
export function NotebookCover({ notebook: n, variant }: { notebook: Pick<LegacyNotebook, 'id' | 'title' | 'category' | 'subject' | 'topic' | 'color' | 'emoji'>; variant: keyof typeof SIZES }) {
  const [w, h] = SIZES[variant];
  const art = useMemo(() => notebookCoverArt({ id: n.id, subject: n.subject, topic: n.topic, title: n.title, category: n.category }, w, h), [n.id, n.subject, n.topic, n.title, n.category, w, h]);
  const colors = notebookCoverColors(safeColor(n.color, NOTEBOOK_COLORS[0]));
  const icon = notebookIcon(n.emoji);
  const id = `cover${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const style = { ['--cover-ink' as string]: colors.ink, ['--cover-badge' as string]: colors.badgeSolid, ['--cover-spine' as string]: `${(art.spine / w) * 100}%` } as CSSProperties;
  return (
    <span className={`notebook-cover notebook-cover--${variant}`} data-cover={art.theme} aria-hidden="true" style={style}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={colors.top} />
            <stop offset="1" stopColor={colors.bottom} />
          </linearGradient>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width={w} height={h} fill={`url(#${id}-bg)`} />
        <g stroke={colors.ink} fill={colors.ink} strokeLinecap="round" strokeLinejoin="round">
          {art.shapes.map((s, i) => (
            <Shape key={i} shape={s} />
          ))}
        </g>
        <rect width={w} height={h} fill={`url(#${id}-sheen)`} />
        {/* Lomo: una banda más oscura con un filo de luz. */}
        <rect width={art.spine} height={h} fill="#000" fillOpacity="0.22" />
        <rect x={art.spine} width="1" height={h} fill="#fff" fillOpacity="0.14" />
      </svg>
      <span className="notebook-cover__badge">
        <UiIcon name={icon.icon} size={variant === 'card' ? 16 : 15} />
      </span>
    </span>
  );
}

function Shape({ shape: s }: { shape: CoverShape }) {
  if (s.kind === 'text') {
    return (
      <text x={s.x} y={s.y} fontSize={s.size} fillOpacity={s.fill} stroke="none" textAnchor={s.anchor ?? 'start'} fontStyle={s.italic ? 'italic' : undefined} style={{ fontFamily: s.font === 'mono' ? MONO : SERIF }}>
        {s.text}
      </text>
    );
  }
  const paint = { strokeOpacity: s.stroke ?? 0, strokeWidth: s.width ?? 1, fillOpacity: s.fill ?? 0, strokeDasharray: 'dash' in s ? s.dash : undefined };
  if (s.kind === 'circle') return <circle cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
  return <path d={s.d} {...paint} />;
}

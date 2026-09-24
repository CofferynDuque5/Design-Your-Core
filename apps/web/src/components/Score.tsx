import type { PillarId } from '@dyc/core';

/** Anillo de puntuación 0–100. Sin datos se muestra la pista vacía y un guion. */
export function ScoreRing({ value, pillar, size = 56, label }: { value: number | null; pillar?: PillarId; size?: number; label: string }) {
  return (
    <div className="score-ring" data-pillar={pillar} style={{ width: size, height: size }}>
      <svg className="ring" viewBox="0 0 36 36" style={{ width: size, height: size, ['--value' as string]: value ?? 0 }} aria-hidden="true">
        <circle className="ring__track" cx="18" cy="18" r="15.5" />
        {value !== null && <circle className="ring__value" cx="18" cy="18" r="15.5" pathLength={100} />}
      </svg>
      <span className="score-ring__value numeric" aria-hidden="true">
        {value ?? '–'}
      </span>
      <span className="visually-hidden">{value === null ? `${label}: sin datos` : `${label}: ${value} de 100`}</span>
    </div>
  );
}

export function Delta({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null) return null;
  if (value === 0) return <span className="delta muted">Igual{suffix}</span>;
  const up = value > 0;
  return (
    <span className={`delta ${up ? 'delta--up' : 'delta--down'}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>
      <span className="visually-hidden">{up ? 'Sube' : 'Baja'}</span> {Math.abs(value)}
      {suffix}
    </span>
  );
}

export function ProgressBar({ value, pillar, label }: { value: number; pillar?: PillarId; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return <div className="progress" data-pillar={pillar} style={{ ['--value' as string]: v }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label} />;
}

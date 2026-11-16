import type { Day, PillarId } from '@dyc/core';
import { shortDay, weekdayShort } from '../lib/format';

interface Point {
  date: Day;
  value: number | null;
}

const W = 640;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 28, left: 32 };

/**
 * Línea de puntuación diaria (0–100). Los días sin datos cortan la línea en
 * lugar de inventar un valor. El resumen para lectores de pantalla va en
 * aria-label; la tabla con los datos exactos, justo debajo (oculta a la vista).
 */
export function TrendChart({ points, pillar, label, today, previous, previousLabel = 'Periodo anterior' }: { points: Point[]; pillar?: PillarId; label: string; today: Day; previous?: Array<number | null>; previousLabel?: string }) {
  const n = points.length;
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - v / 100) * (H - PAD.top - PAD.bottom);

  const segments: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push([x(i), y(p.value)]);
  });
  if (current.length) segments.push(current);

  // El periodo anterior, día a día en la misma posición, como línea discontinua.
  const prevSegments: Array<Array<[number, number]>> = [];
  let prev: Array<[number, number]> = [];
  (previous ?? []).slice(0, n).forEach((v, i) => {
    if (v === null || v === undefined) {
      if (prev.length) prevSegments.push(prev);
      prev = [];
    } else prev.push([x(i), y(v)]);
  });
  if (prev.length) prevSegments.push(prev);
  const hasPrev = prevSegments.some((sgm) => sgm.length > 0);

  const withData = points.filter((p) => p.value !== null);
  const avg = withData.length ? Math.round(withData.reduce((t, p) => t + (p.value as number), 0) / withData.length) : null;
  const gradient = `trend-fill-${pillar ?? 'overall'}`;
  const summary = withData.length
    ? `${label}: ${withData.length} días con datos, de ${Math.min(...withData.map((p) => p.value as number))} a ${Math.max(...withData.map((p) => p.value as number))} sobre 100.`
    : `${label}: sin datos en este periodo.`;
  const labelEvery = n > 10 ? 5 : 1;

  return (
    <figure className="trend" data-pillar={pillar}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${summary}${avg !== null ? ` Media ${avg}.` : ''}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="trend__fill-top" />
            <stop offset="100%" className="trend__fill-bottom" />
          </linearGradient>
        </defs>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line className="trend__grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="trend__axis" x={PAD.left - 8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || n <= 10 ? (
            <text key={p.date} className={`trend__axis${p.date === today ? ' trend__axis--today' : ''}`} x={x(i)} y={H - 8} textAnchor="middle">
              {n <= 10 ? weekdayShort(p.date) : Number(p.date.slice(8))}
            </text>
          ) : null,
        )}
        {avg !== null && withData.length > 1 && <line className="trend__avg" x1={PAD.left} x2={W - PAD.right} y1={y(avg)} y2={y(avg)} />}
        {prevSegments.map((sg, i) =>
          sg.length > 1 ? <polyline key={`p${i}`} className="trend__prev" points={sg.map(([a, b]) => `${a},${b}`).join(' ')} /> : <circle key={`p${i}`} className="trend__prev-dot" cx={sg[0][0]} cy={sg[0][1]} r={3} />,
        )}
        {segments.map((sg, i) =>
          sg.length > 1 ? <polygon key={`a${i}`} className="trend__area" fill={`url(#${gradient})`} points={[`${sg[0][0]},${y(0)}`, ...sg.map(([a, b]) => `${a},${b}`), `${sg[sg.length - 1][0]},${y(0)}`].join(' ')} /> : null,
        )}
        {segments.map((sg, i) =>
          sg.length > 1 ? <polyline key={i} className="trend__line" points={sg.map(([a, b]) => `${a},${b}`).join(' ')} /> : null,
        )}
        {points.map((p, i) =>
          p.value === null ? null : (
            <g key={p.date}>
              <circle className="trend__dot" cx={x(i)} cy={y(p.value)} r={n > 10 ? 3 : 4}>
                <title>{`${shortDay(p.date)}: ${p.value}`}</title>
              </circle>
              {n <= 10 && (
                <text className="trend__value" x={x(i)} y={y(p.value) - 10} textAnchor="middle">
                  {p.value}
                </text>
              )}
            </g>
          ),
        )}
      </svg>
      <figcaption className="trend__legend small">
        <span className="trend__key trend__key--now">Este periodo</span>
        {hasPrev && <span className="trend__key trend__key--prev">{previousLabel}</span>}
        {avg !== null && withData.length > 1 && <span className="trend__key trend__key--avg">Media {avg}</span>}
      </figcaption>
      <table className="visually-hidden">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Puntuación</th>
            {hasPrev && <th scope="col">{previousLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{shortDay(p.date)}</td>
              <td>{p.value ?? 'sin datos'}</td>
              {hasPrev && <td>{previous?.[points.indexOf(p)] ?? 'sin datos'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

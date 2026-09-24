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
export function TrendChart({ points, pillar, label, today }: { points: Point[]; pillar?: PillarId; label: string; today: Day }) {
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

  const withData = points.filter((p) => p.value !== null);
  const summary = withData.length
    ? `${label}: ${withData.length} días con datos, de ${Math.min(...withData.map((p) => p.value as number))} a ${Math.max(...withData.map((p) => p.value as number))} sobre 100.`
    : `${label}: sin datos en este periodo.`;
  const labelEvery = n > 10 ? 5 : 1;

  return (
    <figure className="trend" data-pillar={pillar}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} preserveAspectRatio="none">
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
        {segments.map((s, i) =>
          s.length > 1 ? <polyline key={i} className="trend__line" points={s.map(([a, b]) => `${a},${b}`).join(' ')} /> : null,
        )}
        {segments.flat().map(([a, b], i) => (
          <circle key={i} className="trend__dot" cx={a} cy={b} r={n > 10 ? 3 : 4} />
        ))}
      </svg>
      <table className="visually-hidden">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Puntuación</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{shortDay(p.date)}</td>
              <td>{p.value ?? 'sin datos'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

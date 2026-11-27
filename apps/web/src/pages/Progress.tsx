import type { Dashboard } from '@dyc/api-client';
import { shiftPeriod, type Period, type PillarId } from '@dyc/core';
import { CalendarCheck, ChevronLeft, ChevronRight, CircleDashed, HeartPulse, TrendingUp, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDashboard } from '../app/queries';
import { PageHeader } from '../components/AppShell';
import { Segmented } from '../components/Form';
import { pillarName, pillarShort } from '../components/Pillar';
import { PillarIcon } from '../components/PillarIcon';
import { Delta, ProgressBar, ScoreRing } from '../components/Score';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { TrendChart } from '../components/TrendChart';
import { plural, rangeLabel, shortDay } from '../lib/format';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];
/** «36 puntos menos que…», «1 punto más que…», «Igual que…». */
const pointsWord = (d: number | null) => (!d ? '' : `${Math.abs(d) === 1 ? 'punto' : 'puntos'} ${d > 0 ? 'más' : 'menos'} `);
const PREVIOUS_LABEL: Record<Period, string> = { day: 'Ayer', week: 'Semana anterior', month: 'Mes anterior' };

/** Lo más fuerte, lo que cuidar, lo que más subió y el mejor día del periodo. */
function highlights(d: Dashboard): Array<{ label: string; value: string; icon: typeof Trophy }> {
  const out: Array<{ label: string; value: string; icon: typeof Trophy }> = [];
  const scored = d.pillars.filter((p) => p.score !== null) as Array<(typeof d.pillars)[number] & { score: number }>;
  if (scored.length) {
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    out.push({ label: 'Tu pilar más fuerte', value: `${pillarName(best.id)} · ${best.score}`, icon: Trophy });
  }
  if (scored.length > 1) {
    const low = scored.reduce((a, b) => (b.score < a.score ? b : a));
    out.push({ label: 'Para cuidar', value: `${pillarName(low.id)} · ${low.score}`, icon: HeartPulse });
  }
  const moved = d.pillars.filter((p) => typeof p.delta === 'number' && p.delta > 0);
  if (moved.length) {
    const up = moved.reduce((a, b) => ((b.delta as number) > (a.delta as number) ? b : a));
    out.push({ label: 'Lo que más subió', value: `${pillarName(up.id)} · +${up.delta}`, icon: TrendingUp });
  }
  const days = d.series.filter((s) => s.overall !== null) as Array<{ date: string; overall: number }>;
  if (days.length > 1) {
    const top = days.reduce((a, b) => (b.overall > a.overall ? b : a));
    out.push({ label: 'Tu mejor día', value: `${shortDay(top.date)} · ${top.overall}`, icon: CalendarCheck });
  }
  const missing = d.pillars.filter((p) => p.score === null).length;
  if (missing && out.length < 4) out.push({ label: 'Sin datos aún', value: `${plural(missing, 'pilar', 'pilares')}: haz tu check-in`, icon: CircleDashed });
  return out.slice(0, 4);
}

const PREVIOUS: Record<Period, string> = { day: 'que ayer', week: 'que la semana anterior', month: 'que el mes anterior' };

export function Progress() {
  const [params, setParams] = useSearchParams();
  const period = (PERIODS.some((p) => p.value === params.get('periodo')) ? params.get('periodo') : 'week') as Period;
  const date = params.get('fecha') ?? undefined;
  const dash = useDashboard(period, date);
  // El periodo anterior, para dibujarlo detrás de la línea de este.
  const prevDash = useDashboard(period, dash.data ? shiftPeriod(period, dash.data.date, -1) : undefined, { enabled: !!dash.data && period !== 'day' });

  const go = (next: { period?: Period; date?: string }) => {
    const p = next.period ?? period;
    const d = 'date' in next ? next.date : date;
    setParams({ ...(p !== 'week' ? { periodo: p } : {}), ...(d && dash.data && d < dash.data.today ? { fecha: d } : {}) }, { replace: true });
  };

  const d = dash.data;
  const isCurrent = !d || d.range.to >= d.today;

  return (
    <div className="page">
      <PageHeader eyebrow="Progreso" title={d ? rangeLabel(d.range.from, d.range.to) : 'Tu progreso'}>
        <Segmented label="Periodo" options={PERIODS} value={period} onChange={(p) => go({ period: p, date: undefined })} />
        <div className="row">
          <button type="button" className="icon-btn" aria-label="Periodo anterior" disabled={!d} onClick={() => d && go({ date: shiftPeriod(period, d.date, -1) })}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" aria-label="Periodo siguiente" disabled={isCurrent} onClick={() => d && go({ date: shiftPeriod(period, d.date, 1) })}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </PageHeader>
      {dash.isPending ? (
        <Loading label="Cargando tu progreso" />
      ) : dash.isError ? (
        <ErrorState error={dash.error} retry={() => dash.refetch()} />
      ) : (
        <ProgressContent d={dash.data} period={period} stale={dash.isPlaceholderData} previous={prevDash.data} />
      )}
    </div>
  );
}

function ProgressContent({ d, period, stale, previous }: { d: Dashboard; period: Period; stale: boolean; previous?: Dashboard }) {
  const [focus, setFocus] = useState<PillarId | 'overall'>('overall');
  if (d.overall.score === null) {
    return (
      <EmptyState
        title="Todavía no hay datos en este periodo"
        action={
          d.range.to >= d.today ? (
            <Link className="btn btn--secondary btn--sm" to="/check-in">
              Hacer el check-in de hoy
            </Link>
          ) : undefined
        }
      >
        Tu progreso se calcula con tus check-ins y hábitos. Con un registro ya verás tus seis pilares aquí.
      </EmptyState>
    );
  }

  const valueOf = (s: Dashboard['series'][number]) => (focus === 'overall' ? s.overall : (s.pillars?.[focus] ?? null));
  const points = d.series.map((s) => ({ date: s.date, value: valueOf(s) }));
  const before = previous && previous.period === period ? previous.series.map(valueOf) : undefined;
  const tops = highlights(d);
  const deltaOverall = d.overall.previous !== null && d.overall.score !== null ? d.overall.score - d.overall.previous : null;

  return (
    <div className={`stack-lg${stale ? ' is-stale' : ''}`} aria-busy={stale}>
      <div className="progress-top">
        <section className="card overall" aria-labelledby="overall-title">
          <h2 id="overall-title" className="eyebrow">
            Puntuación general
          </h2>
          <div className="overall__body">
            <ScoreRing value={d.overall.score} size={96} label="Puntuación general" />
            <div className="stack-xs">
              <Delta value={deltaOverall} suffix={` ${pointsWord(deltaOverall)}${PREVIOUS[period]}`} />
              <p className="muted small">Promedio de los pilares con datos, de 0 a 100.</p>
            </div>
          </div>
        </section>
        <div className="stats">
          <div className="stat card">
            <span className="stat__value">{d.checkIns.count}</span>
            <span className="stat__label">{d.checkIns.count === 1 ? 'check-in' : 'check-ins'}</span>
          </div>
          <div className="stat card">
            <span className="stat__value">{d.checkIns.streak}</span>
            <span className="stat__label">{d.checkIns.streak === 1 ? 'día de racha' : 'días de racha'}</span>
          </div>
          <div className="stat card">
            <span className="stat__value">{d.habits.scheduled ? `${Math.round((d.habits.done / d.habits.scheduled) * 100)}%` : '–'}</span>
            <span className="stat__label">{d.habits.scheduled ? `hábitos (${d.habits.done} de ${d.habits.scheduled})` : 'sin hábitos'}</span>
          </div>
        </div>
      </div>

      {period !== 'day' && (
        <section className="card stack" aria-labelledby="trend-title">
          <div className="card__header wrap">
            <h2 id="trend-title" className="section-title">
              Evolución
            </h2>
            <div className="chips" role="group" aria-label="Qué mostrar">
              <button type="button" className="chip-btn" aria-pressed={focus === 'overall'} onClick={() => setFocus('overall')}>
                General
              </button>
              {d.pillars.map((p) => (
                <button key={p.id} type="button" className="chip-btn" data-pillar={p.id} aria-pressed={focus === p.id} onClick={() => setFocus(p.id)}>
                  {pillarShort(p.id)}
                </button>
              ))}
            </div>
          </div>
          <TrendChart points={points} previous={before} previousLabel={PREVIOUS_LABEL[period]} pillar={focus === 'overall' ? undefined : focus} today={d.today} label={focus === 'overall' ? 'Puntuación general por día' : `${pillarName(focus)} por día`} />
        </section>
      )}

      {tops.length > 0 && (
        <section aria-labelledby="highlights-title" className="stack-sm">
          <h2 id="highlights-title" className="section-title">
            Lo destacado
          </h2>
          <ul className="highlights">
            {tops.map((h) => (
              <li key={h.label} className="card highlight">
                <span className="highlight__icon" aria-hidden="true">
                  <h.icon size={20} />
                </span>
                <span>
                  <span className="highlight__label">{h.label}</span>
                  <span className="highlight__value">{h.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack" aria-labelledby="pillars-title">
        <h2 id="pillars-title" className="section-title">
          Tus pilares
        </h2>
        <ul className="pillar-bars">
          {d.pillars.map((p) => (
            <li key={p.id} data-pillar={p.id}>
              <span className="pillar-bars__name">
                <PillarIcon pillar={p.id} className="pillar-color" />
                {pillarName(p.id)}
              </span>
              <ProgressBar value={p.score ?? 0} pillar={p.id} label={pillarName(p.id)} />
              <span className="pillar-bars__value numeric">{p.score ?? '–'}</span>
              <span className="pillar-bars__delta">
                {p.score === null ? <span className="muted small">sin datos</span> : <Delta value={p.delta} />}
              </span>
            </li>
          ))}
        </ul>
        {period !== 'day' && (
          <p className="muted small">
            Cada pilar se calcula con los días que tienen datos: {d.pillars.map((p) => `${pillarShort(p.id)} ${plural(p.daysWithData, 'día', 'días')}`).join(', ')}.
          </p>
        )}
      </section>

    </div>
  );
}

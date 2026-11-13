import type { CheckIn, Dashboard } from '@dyc/api-client';
import { useMutation } from '@tanstack/react-query';
import {
  consistencyGrid,
  consistencyLevel,
  consistencyStats,
  DAY_PLAN_KIND_LABEL,
  dayFocus,
  dayPlan,
  firstProject,
  phraseOfDay,
  PROJECT_PRIORITY_INFO,
  projectPriorityOf,
  projectProgress,
  STREAK_MILESTONES,
  streakNudge,
  upcoming,
  WEEKLY_TARGET,
  type ConsistencyDay,
  type ConsistencyStats,
  type LegacyData, positiveMessage } from '@dyc/core';
import { ArrowRight, Award, Crosshair, Flag, Flame, Lock, PenLine, Quote, Timer, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../app/api';
import { useLegacyData, useLegacyList } from '../app/legacy';
import { useToggleChallenge, useToggleHabit } from '../app/mutations';
import { useDashboard, useRefresh } from '../app/queries';
import { useSession } from '../app/session';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { ChallengeCard } from '../components/ChallengeCard';
import { Scale } from '../components/Form';
import { HabitCheck } from '../components/HabitCheck';
import { pillarShort } from '../components/Pillar';
import { RecommendationCard } from '../components/Recommendation';
import { ScoreRing } from '../components/Score';
import { EmptyState, ErrorState, errorMessage, Loading } from '../components/States';
import { firstName, greeting, longDay, plural } from '../lib/format';

export function Today() {
  const { user } = useSession();
  const dash = useDashboard('week');
  const name = firstName(user?.name);

  return (
    <div className="page">
      <PageHeader eyebrow={dash.data ? longDay(dash.data.today) : 'Hoy'} title={name ? `${greeting()}, ${name}` : greeting()} />
      {dash.isPending ? (
        <div className="stack-lg">
          <Loading label="Cargando tu día" />
          <Loading />
        </div>
      ) : dash.isError ? (
        <ErrorState error={dash.error} retry={() => dash.refetch()} />
      ) : (
        <TodayContent d={dash.data} />
      )}
    </div>
  );
}

function TodayContent({ d }: { d: Dashboard }) {
  const toggleHabit = useToggleHabit();
  const toggleChallenge = useToggleChallenge();
  const legacy = useLegacyData();
  const habits = d.todayStatus.habits;
  const doneHabits = habits.filter((h) => h.done).length;
  // La tarjeta de check-in ya está en el mosaico: no se repite como sugerencia.
  const recs = d.recommendations.filter((r) => r.action?.type !== 'check-in');
  const days = d.consistency ?? [];
  const stats = consistencyStats(days, d.today);

  return (
    <div className="stack-lg">
      <FocusHero d={d} data={legacy.data?.data} streak={stats.streak} />

      <div className="bento">
        <div className="bento__main">
          <ConsistencyCard days={days} today={d.today} stats={stats} />
          <div className="bento__duo">
            <section className="card stack" aria-labelledby="habits-today">
              <div className="section-head">
                <h2 id="habits-today" className="section-title">
                  Hábitos de hoy
                </h2>
                {habits.length > 0 && (
                  <span className="muted numeric">
                    {doneHabits} de {habits.length}
                  </span>
                )}
              </div>
              {habits.length ? (
                <div className="card--list">
                  {habits.map((h) => (
                    <HabitCheck key={h.id} title={h.title} pillar={h.pillar} done={h.done} onToggle={() => toggleHabit.mutate({ id: h.id, date: d.today, done: !h.done })} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Sin hábitos para hoy"
                  action={
                    <Link className="btn btn--secondary btn--sm" to="/habitos">
                      Crear un hábito
                    </Link>
                  }
                >
                  Un hábito es algo pequeño que repites: beber agua al despertar, caminar diez minutos, escribir una línea antes de dormir.
                </EmptyState>
              )}
            </section>
            <CheckInCard today={d.today} checkIn={d.todayStatus.checkIn} />
          </div>
          <div className="bento__duo">
            <MilestonesCard stats={stats} />
            <FirstProjectCard />
          </div>
        </div>
        <div className="bento__side">
          <ScoreCard d={d} />
          <DayPlanCard data={legacy.data?.data} />
          {recs.length > 0 && (
            <section className="stack" aria-labelledby="recs">
              <h2 id="recs" className="section-title">
                Para ti
              </h2>
              {recs.map((r) => (
                <RecommendationCard key={r.key} rec={r} />
              ))}
            </section>
          )}
        </div>
        <PillarsCard d={d} />
        <section className="card stack" aria-labelledby="challenges-today">
          <div className="section-head">
            <h2 id="challenges-today" className="section-title">
              Retos activos
            </h2>
            <Link to="/retos" className="section-link">
              Ver retos <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {d.challenges.length ? (
            <div className="stack">
              {d.challenges.map((c) => (
                <ChallengeCard key={c.id} c={c} busy={toggleChallenge.isPending} onToggleToday={() => toggleChallenge.mutate({ id: c.id, date: d.today, done: !c.doneToday })} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Ningún reto en marcha"
              action={
                <Link className="btn btn--secondary btn--sm" to="/retos">
                  Elegir un reto
                </Link>
              }
            >
              Los retos duran entre 5 y 14 días y están pensados para cumplirse.
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}

/** Portada: lo único importante de hoy, con un botón para empezar el foco. */
function FocusHero({ d, data, streak }: { d: Dashboard; data: LegacyData | undefined; streak: number }) {
  const habits = d.todayStatus.habits;
  const focus = dayFocus(data, habits);
  const todayItem = d.consistency?.find((c) => c.date === d.today);
  const done = todayItem?.done ?? habits.filter((h) => h.done).length + (d.todayStatus.checkIn ? 1 : 0);
  const total = todayItem?.total ?? habits.length + 1;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <section className="card focus-hero" aria-labelledby="focus-title">
      <p className="eyebrow focus-hero__eyebrow">
        <Crosshair size={14} aria-hidden="true" className="inline-icon" /> Tu enfoque de hoy
      </p>
      <h2 id="focus-title" className="focus-hero__title">
        {focus ? (
          <>
            Hoy, una cosa a la vez: <em>{focus.title}</em>
          </>
        ) : (
          <>
            Tu día está en orden. <em>Elige algo que te acerque a tus metas.</em>
          </>
        )}
      </h2>
      {focus && <p className="muted">{focus.detail}</p>}
      <p className="focus-hero__cheer">
        <Sparkles size={16} aria-hidden="true" /> {positiveMessage()}
      </p>
      <dl className="focus-hero__meta">
        <div>
          <dt>Puntuación de la semana</dt>
          <dd className="numeric">{d.overall.score ?? '—'}</dd>
        </div>
        <div>
          <dt>Días de racha</dt>
          <dd className="numeric focus-hero__streak">{streak}</dd>
        </div>
        <div>
          <dt>Hábitos hechos hoy</dt>
          <dd className="numeric">
            {habits.filter((h) => h.done).length}/{habits.length}
          </dd>
        </div>
      </dl>
      <div className="focus-hero__today">
        <div className="focus-hero__bar" role="progressbar" aria-label="Lo de hoy" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={`${done} de ${total}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="small muted numeric">
          Hoy llevas {done} de {total}
        </span>
      </div>
      <div className="row">
        <Link to="/enfoque" className="btn">
          <Timer size={18} aria-hidden="true" /> Empezar 25 min de foco
        </Link>
        {focus && (
          <Link to={focus.url} className="btn btn--ghost">
            {focus.linkLabel}
          </Link>
        )}
        {!d.todayStatus.checkIn && (
          <Link to="/check-in" className="btn btn--ghost">
            Check-in
          </Link>
        )}
      </div>
    </section>
  );
}

/** El mapa de 12 semanas, la racha y lo que falta para la próxima meta. */
function ConsistencyCard({ days, today, stats }: { days: ConsistencyDay[]; today: string; stats: ConsistencyStats }) {
  const grid = consistencyGrid(days, today);
  const next = stats.next;
  const toNext = next ? Math.round(((next.target - next.left) / next.target) * 100) : 100;
  return (
    <section className="card streak-card" aria-labelledby="streak-title">
      <div className="streak-card__head">
        <div className="stack-xs">
          <h2 id="streak-title" className="section-title">
            Constancia
          </h2>
          <p className="streak-card__nudge">{streakNudge(stats)}</p>
        </div>
        <div className={`streak-card__count${stats.todayDone ? ' is-lit' : ''}`}>
          <Flame size={22} aria-hidden="true" />
          <span className="numeric">{stats.streak}</span>
          <span className="small">{stats.streak === 1 ? 'día seguido' : 'días seguidos'}</span>
        </div>
      </div>

      <div className="streak-card__body">
      <div className="streak-card__map">
      <div className="heatmap-wrap">
        <div className="heatmap__days" aria-hidden="true">
          {WEEKDAY_LETTERS.map((l, i) => (
            <span key={i}>{i % 2 === 0 ? l : ''}</span>
          ))}
        </div>
        <ol className="heatmap" aria-label="Días con algo hecho en las últimas 12 semanas">
          {grid.flatMap((week, w) =>
            week.map((c, i) =>
              c ? (
                <li key={c.date} className="heatmap__cell" data-level={consistencyLevel(c)} data-today={c.date === today || undefined} style={{ gridColumn: w + 1, gridRow: i + 1 }} title={cellLabel(c)}>
                  <span className="visually-hidden">{cellLabel(c)}</span>
                </li>
              ) : (
                <li key={`f${w}-${i}`} className="heatmap__cell heatmap__cell--future" aria-hidden="true" style={{ gridColumn: w + 1, gridRow: i + 1 }} />
              ),
            ),
          )}
        </ol>
      </div>
      <div className="heatmap__legend small muted" aria-hidden="true">
        Menos
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="heatmap__cell" data-level={l} />
        ))}
        Más
      </div>
      </div>

      <dl className="streak-card__stats">
        <div>
          <dt>Mejor racha</dt>
          <dd className="numeric">{plural(stats.best, 'día', 'días')}</dd>
        </div>
        <div>
          <dt>Esta semana</dt>
          <dd className="numeric">
            {stats.weekActive} de {WEEKLY_TARGET} días
          </dd>
        </div>
        <div>
          <dt>Días completos</dt>
          <dd className="numeric">{stats.perfectDays}</dd>
        </div>
      </dl>
      </div>
      {next && (
        <div className="streak-card__next">
          <div className="focus-hero__bar" role="progressbar" aria-label={`Hacia ${next.target} días seguidos`} aria-valuemin={0} aria-valuemax={next.target} aria-valuenow={next.target - next.left}>
            <span style={{ width: `${toNext}%` }} />
          </div>
          <span className="small muted">
            Próxima meta: {next.target} días seguidos. Te {next.left === 1 ? 'falta 1 día' : `faltan ${next.left} días`}.
          </span>
        </div>
      )}
    </section>
  );
}

const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function cellLabel(c: ConsistencyDay) {
  const when = longDay(c.date);
  if (c.done <= 0) return `${when}: sin actividad`;
  return `${when}: ${c.done} de ${c.total} hecho${c.total === 1 ? '' : 's'}`;
}

/** Puntuación grande con la diferencia frente a la semana anterior y la frase del día. */
function ScoreCard({ d }: { d: Dashboard }) {
  const delta = d.overall.score !== null && d.overall.previous !== null ? d.overall.score - d.overall.previous : null;
  return (
    <section className="card stack score-card" aria-labelledby="week-title">
      <div className="section-head">
        <h2 id="week-title" className="section-title">
          Tu semana
        </h2>
        <Link to="/progreso" className="section-link">
          Progreso <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="week-summary">
        <ScoreRing value={d.overall.score} size={96} label="Puntuación de la semana" />
        <div className="stack-xs">
          {delta !== null ? (
            <span className={`score-card__delta numeric${delta < 0 ? ' is-down' : ''}`}>
              {delta > 0 ? '+' : ''}
              {delta} puntos
            </span>
          ) : (
            <span className="muted">Primera semana con datos</span>
          )}
          <span className="muted small numeric">{d.habits.scheduled ? `${d.habits.done} de ${d.habits.scheduled} hábitos cumplidos` : 'Sin hábitos programados'}</span>
          <span className="muted small numeric">{plural(d.checkIns.streak, 'día seguido', 'días seguidos')} con check-in</span>
        </div>
      </div>
      <blockquote className="score-card__quote">
        <Quote size={16} aria-hidden="true" />
        <p>{phraseOfDay(d.today)}</p>
      </blockquote>
    </section>
  );
}

/** Rachas conseguidas: se desbloquean al llegar a 3, 7, 14… días seguidos. */
function MilestonesCard({ stats }: { stats: ConsistencyStats }) {
  const shown = STREAK_MILESTONES.slice(0, 6);
  return (
    <section className="card stack" aria-labelledby="milestones-title">
      <div className="section-head">
        <h2 id="milestones-title" className="section-title">
          Logros de constancia
        </h2>
        <span className="muted small numeric">
          {stats.reached.length} de {STREAK_MILESTONES.length}
        </span>
      </div>
      <ul className="milestones">
        {shown.map((m) => {
          const got = stats.reached.includes(m);
          return (
            <li key={m} className={`milestone${got ? ' is-got' : ''}`}>
              <span className="milestone__icon">{got ? <Award size={20} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}</span>
              <span className="milestone__value numeric" aria-hidden="true">
                {m}
              </span>
              <span className="milestone__unit" aria-hidden="true">
                días
              </span>
              <span className="visually-hidden">{got ? `${m} días seguidos, conseguido` : `${m} días seguidos, por conseguir`}</span>
            </li>
          );
        })}
      </ul>
      <p className="muted small">{stats.next ? `Tu mejor racha: ${plural(stats.best, 'día', 'días')}. La siguiente medalla llega a los ${stats.next.target}.` : 'Conseguiste todas las medallas. Ahora, a mantenerlo.'}</p>
    </section>
  );
}

/** Lo que tiene hora hoy: horario, cursos, rutinas y agenda. */
function DayPlanCard({ data }: { data: LegacyData | undefined }) {
  const items = upcoming(dayPlan(data));
  return (
    <section className="card stack" aria-labelledby="dayplan-title">
      <div className="section-head">
        <h2 id="dayplan-title" className="section-title">
          Tu día
        </h2>
        <Link to="/horario" className="section-link">
          Horario <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {items.length ? (
        <ol className="dayplan">
          {items.map((i) => (
            <li key={i.id} className={`dayplan__item${i.now ? ' is-now' : ''}`}>
              <span className="dayplan__time numeric">{i.time}</span>
              <Link to={i.url} className="dayplan__title">
                {i.title}
              </Link>
              <span className="dayplan__kind small muted">
                {i.now ? 'Ahora · ' : ''}
                {DAY_PLAN_KIND_LABEL[i.kind]}
                {i.end ? ` · hasta ${i.end}` : ''}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No queda nada con hora para hoy. Buen momento para una sesión de foco.</p>
      )}
    </section>
  );
}

/** Cada pilar con su puntuación y su curva de la semana. */
function PillarsCard({ d }: { d: Dashboard }) {
  const withData = d.pillars.some((p) => p.score !== null);
  return (
    <section className="card stack" aria-labelledby="pillars-title">
      <div className="section-head">
        <h2 id="pillars-title" className="section-title">
          Tus pilares
        </h2>
        <Link to="/progreso" className="section-link">
          Ver evolución <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {withData ? (
        <ul className="pillar-tiles">
          {d.pillars.map((p) => (
            <li key={p.id} className="pillar-tile" data-pillar={p.id}>
              <span className="pillar-tile__name">{pillarShort(p.id)}</span>
              <span className="pillar-tile__score numeric">{p.score ?? '—'}</span>
              <span className={`pillar-tile__delta small numeric${(p.delta ?? 0) < 0 ? ' is-down' : ''}`}>
                {p.delta === null ? 'sin comparación' : `${p.delta > 0 ? '+' : ''}${p.delta} vs. semana anterior`}
              </span>
              <Sparkline values={d.series.map((s) => s.pillars?.[p.id] ?? null)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Tus pilares aparecerán aquí después de tu primer check-in.</p>
      )}
    </section>
  );
}

function Sparkline({ values }: { values: Array<number | null> }) {
  const pts = values.map((v, i) => (v === null ? null : { x: values.length > 1 ? (i / (values.length - 1)) * 100 : 50, y: 30 - (v / 100) * 26 }));
  const known = pts.filter((p): p is { x: number; y: number } => p !== null);
  if (known.length < 2) return <span className="pillar-tile__spark" aria-hidden="true" />;
  const line = known.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <svg className="pillar-tile__spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L${known[known.length - 1].x.toFixed(1)} 32 L${known[0].x.toFixed(1)} 32 Z`} className="spark__area" />
      <path d={line} className="spark__line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function CheckInCard({ today, checkIn }: { today: string; checkIn: CheckIn | null }) {
  const refresh = useRefresh();
  const toast = useToast();
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: () => api.checkIns.save(today, { ...(mood ? { mood } : {}), ...(energy ? { energy } : {}) }),
    onSuccess: () => {
      toast('Check-in guardado.');
      return refresh('checkins');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  if (checkIn) {
    const parts = [
      checkIn.mood && `ánimo ${checkIn.mood}/5`,
      checkIn.energy && `energía ${checkIn.energy}/5`,
      checkIn.stress && `estrés ${checkIn.stress}/5`,
      checkIn.sleepHours !== null && `${String(checkIn.sleepHours).replace('.', ',')} h de sueño`,
      checkIn.activeMinutes !== null && `${checkIn.activeMinutes} min activos`,
    ].filter(Boolean);
    return (
      <section className="card checkin-done" aria-labelledby="checkin-title">
        <div className="card__header">
          <h2 id="checkin-title" className="section-title">
            Check-in de hoy
          </h2>
          <Link to="/check-in" className="btn btn--ghost btn--sm">
            <PenLine size={16} aria-hidden="true" /> Completar
          </Link>
        </div>
        <p className="muted">{parts.length ? `Registraste ${parts.join(', ')}.` : 'Ya empezaste tu check-in de hoy.'}</p>
      </section>
    );
  }

  return (
    <section className="card card--accent stack" aria-labelledby="checkin-title">
      <div className="stack-xs">
        <h2 id="checkin-title" className="section-title">
          ¿Cómo estás hoy?
        </h2>
        <p className="muted">Dos toques bastan. Si quieres, completa el resto después.</p>
      </div>
      <Scale legend="Ánimo" value={mood} onChange={setMood} low="Bajo" high="Muy bien" />
      <Scale legend="Energía" value={energy} onChange={setEnergy} low="Muy baja" high="Muy alta" />
      <div className="row">
        <button type="button" className="btn" disabled={(!mood && !energy) || save.isPending} aria-busy={save.isPending} onClick={() => save.mutate()}>
          Guardar
        </button>
        <Link to="/check-in" className="btn btn--ghost">
          Abrir el check-in completo
        </Link>
      </div>
    </section>
  );
}

/** El proyecto que toca terminar primero (el número 1 de Proyectos). */
function FirstProjectCard() {
  const legacy = useLegacyData();
  const projects = useLegacyList(legacy.data?.data, 'projects');
  const p = firstProject(projects);
  if (!p) return null;
  const priority = projectPriorityOf(p);
  const pct = projectProgress(p);
  return (
    <section className="card stack" aria-labelledby="first-project-title">
      <div className="section-head">
        <h2 id="first-project-title" className="section-title">
          Termina primero
        </h2>
        <Link to="/proyectos" className="section-link">
          Proyectos <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <p className="first-project__name">{p.title || 'Sin título'}</p>
      <p className="muted small">
        <Flag size={14} aria-hidden="true" className="inline-icon" /> Prioridad {PROJECT_PRIORITY_INFO[priority].label.toLowerCase()}
        {p.deadline?.trim() ? ` · Entrega ${p.deadline}` : ''} · {pct} % hecho
      </p>
    </section>
  );
}

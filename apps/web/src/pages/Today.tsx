import type { CheckIn, Dashboard } from '@dyc/api-client';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, PenLine } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../app/api';
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
        <div className="today-grid">
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
  const habits = d.todayStatus.habits;
  const doneHabits = habits.filter((h) => h.done).length;
  // La tarjeta de check-in ya está arriba: no se repite como sugerencia.
  const recs = d.recommendations.filter((r) => r.action?.type !== 'check-in');

  return (
    <div className="today-grid">
      <div className="stack-lg">
        <CheckInCard today={d.today} checkIn={d.todayStatus.checkIn} />

        <section className="stack" aria-labelledby="habits-today">
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
            <div className="card card--list">
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

        <section className="stack" aria-labelledby="challenges-today">
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

      <aside className="stack-lg" aria-label="Resumen y sugerencias">
        <WeekCard d={d} />
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
      </aside>
    </div>
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
          Check-in completo
        </Link>
      </div>
    </section>
  );
}

function WeekCard({ d }: { d: Dashboard }) {
  const withData = d.pillars.filter((p) => p.score !== null);
  return (
    <section className="card stack" aria-labelledby="week-title">
      <div className="card__header">
        <h2 id="week-title" className="section-title">
          Tu semana
        </h2>
        <Link to="/progreso" className="section-link">
          Progreso <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="week-summary">
        <ScoreRing value={d.overall.score} size={72} label="Puntuación de la semana" />
        <div className="stack-xs">
          <span className="numeric">{plural(d.checkIns.streak, 'día seguido', 'días seguidos')} con check-in</span>
          <span className="muted numeric">
            {d.habits.scheduled ? `${d.habits.done} de ${d.habits.scheduled} hábitos cumplidos` : 'Sin hábitos programados'}
          </span>
        </div>
      </div>
      {withData.length ? (
        <ul className="pillar-rings">
          {d.pillars.map((p) => (
            <li key={p.id}>
              <ScoreRing value={p.score} pillar={p.id} size={44} label={pillarShort(p.id)} />
              <span className="pillar-rings__label">{pillarShort(p.id)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Tus pilares aparecerán aquí después de tu primer check-in.</p>
      )}
    </section>
  );
}

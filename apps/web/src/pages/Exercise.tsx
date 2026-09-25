import { isDay, shortDay, utcDayKey, workoutStats, WORKOUT_PLANS, type LegacyWorkout } from '@dyc/core';
import { CalendarPlus, Check, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { CheckInNote, FormActions, Stats } from '../components/ToolParts';

const HISTORY_MAX = 60;
const byDateDesc = (a: LegacyWorkout, b: LegacyWorkout) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export function Exercise() {
  const legacy = useLegacyData();
  const workouts = useLegacyList(legacy.data?.data, 'workouts');
  const actions = useModule('workouts');
  const routines = useModule('routines');
  const toast = useToast();
  // La app anterior guarda el día en UTC.
  const today = utcDayKey();
  const stats = useMemo(() => workoutStats(workouts, today), [workouts, today]);
  const history = useMemo(() => [...workouts].filter((w) => isDay(w.date)).sort(byDateDesc), [workouts]);
  const [editing, setEditing] = useState<LegacyWorkout | 'new' | null>(null);
  const doneToday = new Set(workouts.filter((w) => w.date === today).map((w) => w.plan));

  const log = (plan: string, minutes: number) => {
    actions.add({ id: newId(), date: today, plan, minutes });
    toast(`Entreno registrado: ${plan}, ${minutes} min.`);
  };
  // Como la app anterior: una rutina diaria a las 18:00.
  const schedule = (plan: string) => {
    routines.add({ id: newId(), title: `🏋️ Entreno: ${plan}`, time: '18:00', days: '1234567', icon: 'bell', sound: true, enabled: true });
    toast(`«${plan}» añadido a tu Rutina, todos los días a las 18:00.`);
  };
  const remove = (w: LegacyWorkout) => {
    const order = workouts.map((x) => x.id);
    actions.remove(w.id);
    toast('Entreno eliminado.', {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(w);
          actions.reorder(order);
        },
      },
    });
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Salud" title="Ejercicio">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Registrar entreno
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus entrenos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          <Stats
            items={[
              { value: stats.weekCount, label: stats.weekCount === 1 ? 'Entreno esta semana' : 'Entrenos esta semana' },
              { value: `${stats.weekMinutes} min`, label: 'Esta semana' },
              { value: stats.streak, label: stats.streak === 1 ? 'Día seguido' : 'Días seguidos' },
            ]}
          />
          <section className="stack" aria-labelledby="plans-title">
            <h2 id="plans-title" className="section-title">
              Planes
            </h2>
            <ul className="plan-grid" aria-label="Planes de entreno">
              {WORKOUT_PLANS.map((p) => (
                <li key={p.name} className="card plan-card">
                  <span className="plan-card__icon" aria-hidden="true">
                    <Dumbbell size={20} />
                  </span>
                  <div className="plan-card__text">
                    <h3 className="plan-card__title">{p.name}</h3>
                    <p className="muted small">
                      {p.minutes} min · {p.detail}
                    </p>
                  </div>
                  <div className="plan-card__actions">
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => log(p.name, p.minutes)} aria-label={`Hecho hoy: ${p.name}`}>
                      <Check size={16} aria-hidden="true" /> {doneToday.has(p.name) ? 'Otra vez' : 'Hecho hoy'}
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => schedule(p.name)} aria-label={`Agendar ${p.name} en tu Rutina`}>
                      <CalendarPlus size={16} aria-hidden="true" /> Agendar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="card card--list" aria-labelledby="history-title">
            <h2 id="history-title" className="list-count">
              Historial <span className="chip small numeric">{stats.total}</span>
            </h2>
            {history.length === 0 ? (
              <EmptyState title="Aún no hay entrenos">Marca un plan como hecho o registra tu propio entreno.</EmptyState>
            ) : (
              <ul className="day-items">
                {history.slice(0, HISTORY_MAX).map((w) => {
                  const label = `${w.plan || 'Entreno'} del ${shortDay(w.date)}`;
                  return (
                    <li key={w.id}>
                      <span className="mark mark--workout" aria-hidden="true" />
                      <span className="day-item__text">
                        <strong>{w.plan || 'Entreno'}</strong>
                        <span className="muted small">
                          {shortDay(w.date)}
                          {w.date === today ? ' · hoy' : ''} · {typeof w.minutes === 'number' ? `${w.minutes} min` : 'sin duración'}
                        </span>
                      </span>
                      <button type="button" className="icon-btn" onClick={() => setEditing(w)} aria-label={`Editar ${label}`}>
                        <Pencil size={18} aria-hidden="true" />
                      </button>
                      <button type="button" className="icon-btn" onClick={() => remove(w)} aria-label={`Borrar ${label}`}>
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {history.length > HISTORY_MAX && <p className="muted small">Se muestran los {HISTORY_MAX} más recientes.</p>}
          </section>
          <CheckInNote>El check-in diario registra aparte tus minutos activos para el pilar Movimiento; estos entrenos aún no cambian tu puntuación.</CheckInNote>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Registrar entreno' : 'Editar entreno'}>
        {editing !== null && <WorkoutForm workout={editing === 'new' ? null : editing} today={today} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function WorkoutForm({ workout, today, onDone }: { workout: LegacyWorkout | null; today: string; onDone: () => void }) {
  const actions = useModule('workouts');
  const [plan, setPlan] = useState(workout?.plan ?? '');
  const [minutes, setMinutes] = useState(String(workout?.minutes ?? 30));
  const [date, setDate] = useState(workout?.date ?? today);
  const m = Number(minutes);
  const minutesOk = Number.isInteger(m) && m >= 1 && m <= 1440;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!plan.trim() || !minutesOk || !date) return;
    const fields = { plan: plan.trim(), minutes: m, date };
    if (workout) actions.update(workout.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Entreno" value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={120} required autoFocus placeholder="Full body, correr, yoga…" list="workout-plans" />
      <datalist id="workout-plans">
        {WORKOUT_PLANS.map((p) => (
          <option key={p.name} value={p.name} />
        ))}
      </datalist>
      <div className="grid-2">
        <TextField label="Minutos" type="number" inputMode="numeric" min="1" max="1440" step="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} required error={minutesOk ? null : 'Entre 1 y 1440 minutos.'} />
        <TextField label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <FormActions
        submitLabel={workout ? 'Guardar' : 'Registrar'}
        disabled={!plan.trim() || !minutesOk || !date}
        onDelete={
          workout
            ? () => {
                actions.remove(workout.id);
                onDone();
              }
            : undefined
        }
        confirm="Se borrará este entreno."
      />
    </form>
  );
}

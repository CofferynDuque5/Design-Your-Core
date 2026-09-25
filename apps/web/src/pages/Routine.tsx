import { daysLabel, MEAL_LABELS, onWeekday, utcDayKey, waterToday, WATER_GOAL_DEFAULT, type LegacyMeal, type LegacyRoutine } from '@dyc/core';
import { GlassWater, Minus, Pencil, Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useLegacyObject, useModule, useModuleObject } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { CheckInNote, FormActions, Meter, optionsWith, WeekdayPicker } from '../components/ToolParts';
import { isoDay, localTime } from '../lib/tools';

const DAY_FILTERS = [
  { iso: 0, short: 'Todos', long: 'Todos los días' },
  { iso: 1, short: 'L', long: 'Lunes' },
  { iso: 2, short: 'M', long: 'Martes' },
  { iso: 3, short: 'X', long: 'Miércoles' },
  { iso: 4, short: 'J', long: 'Jueves' },
  { iso: 5, short: 'V', long: 'Viernes' },
  { iso: 6, short: 'S', long: 'Sábado' },
  { iso: 7, short: 'D', long: 'Domingo' },
];
const validDays = (d: unknown) => (typeof d === 'string' && /^[1-7]{1,7}$/.test(d) ? d : '1234567');
const byTime = <T extends { time?: string }>(a: T, b: T) => (a.time || '99').localeCompare(b.time || '99');

export function Routine() {
  const legacy = useLegacyData();
  const routines = useLegacyList(legacy.data?.data, 'routines');
  const meals = useLegacyList(legacy.data?.data, 'meals');
  const [day, setDay] = useState(isoDay());
  const [editing, setEditing] = useState<LegacyRoutine | 'new' | null>(null);
  const [meal, setMeal] = useState<LegacyMeal | 'new' | null>(null);
  // Comidas y agua van por día en UTC, como la app anterior.
  const today = utcDayKey();
  const shown = useMemo(() => routines.filter((r) => day === 0 || onWeekday(r.days, day)).sort(byTime), [routines, day]);
  const todayMeals = useMemo(() => meals.filter((m) => m.dateKey === today).sort(byTime), [meals, today]);
  const filter = DAY_FILTERS.find((f) => f.iso === day) ?? DAY_FILTERS[0];

  return (
    <div className="page">
      <PageHeader eyebrow="Salud" title="Rutina">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nueva rutina
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tu rutina" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          <div className="agenda-grid">
            <section className="card stack" aria-labelledby="routines-title">
              <div className="section-head section-head--wrap">
                <h2 id="routines-title" className="list-count">
                  {day === 0 ? 'Todas tus rutinas' : `Rutinas del ${filter.long.toLowerCase()}${day === isoDay() ? ' (hoy)' : ''}`}
                </h2>
              </div>
              <div className="chips" role="group" aria-label="Día de la semana">
                {DAY_FILTERS.map((f) => (
                  <button key={f.iso} type="button" className="chip-btn day-chip" aria-pressed={day === f.iso} onClick={() => setDay(f.iso)}>
                    <span aria-hidden="true">{f.short}</span>
                    <span className="visually-hidden">{f.long}</span>
                  </button>
                ))}
              </div>
              {routines.length === 0 ? (
                <EmptyState
                  title="Aún no tienes rutinas"
                  action={
                    <button type="button" className="btn btn--secondary" onClick={() => setEditing('new')}>
                      <Plus size={18} aria-hidden="true" /> Crear la primera
                    </button>
                  }
                >
                  Tus hábitos con hora fija: despertar, tomar vitaminas, entrenar, leer antes de dormir.
                </EmptyState>
              ) : shown.length === 0 ? (
                <p className="muted recent-empty">Nada este día.</p>
              ) : (
                <ul className="routine-list">
                  {shown.map((r) => (
                    <RoutineRow key={r.id} routine={r} onEdit={() => setEditing(r)} />
                  ))}
                </ul>
              )}
            </section>
            <div className="stack agenda-side">
              <WaterCard today={today} />
              <section className="card stack-sm" aria-labelledby="meals-title">
                <div className="section-head">
                  <h2 id="meals-title" className="list-count">
                    Comidas de hoy
                  </h2>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMeal('new')} aria-label="Añadir comida">
                    <Plus size={16} aria-hidden="true" /> Añadir
                  </button>
                </div>
                {todayMeals.length === 0 ? (
                  <p className="muted small">Aún no has anotado comidas hoy.</p>
                ) : (
                  <ul className="day-items">
                    {todayMeals.map((m) => (
                      <MealRow key={m.id} meal={m} onEdit={() => setMeal(m)} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
          <CheckInNote>El check-in diario registra aparte tus vasos de agua y tu alimentación para el pilar Alimentación.</CheckInNote>
          <p className="muted small">Los avisos con sonido de la app anterior todavía no están en la app nueva: aquí organizas tus rutinas y ves qué toca cada día.</p>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva rutina' : 'Editar rutina'}>
        {editing !== null && <RoutineForm routine={editing === 'new' ? null : editing} day={day} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={meal !== null} onClose={() => setMeal(null)} title={meal === 'new' ? 'Nueva comida' : 'Editar comida'}>
        {meal !== null && <MealForm meal={meal === 'new' ? null : meal} today={today} onDone={() => setMeal(null)} />}
      </Dialog>
    </div>
  );
}

function RoutineRow({ routine: r, onEdit }: { routine: LegacyRoutine; onEdit: () => void }) {
  const actions = useModule('routines');
  const title = r.title || 'Sin título';
  const off = r.enabled === false;
  return (
    <li className={`routine-row${off ? ' routine-row--off' : ''}`}>
      <span className="routine-row__time numeric">{r.time || '--:--'}</span>
      <span className="day-item__text">
        <strong>{title}</strong>
        <span className="muted small">
          {daysLabel(validDays(r.days))}
          {off ? ' · desactivada' : ''}
        </span>
      </span>
      <label className="switch">
        <input type="checkbox" role="switch" checked={!off} onChange={() => actions.update(r.id, { enabled: off })} />
        <span aria-hidden="true" />
        <span className="visually-hidden">Activa: «{title}»</span>
      </label>
      <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${title}»`}>
        <Pencil size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

function WaterCard({ today }: { today: string }) {
  const legacy = useLegacyData();
  const log = useLegacyObject(legacy.data?.data, 'dayLog', today);
  const actions = useModuleObject('dayLog');
  const water = waterToday(log, today);
  const goal = typeof log.waterGoal === 'number' && log.waterGoal >= 1 && log.waterGoal <= 40 ? log.waterGoal : WATER_GOAL_DEFAULT;
  // Si el registro es de otro día, empieza en 0 (como la app anterior en el primer cambio).
  const set = (n: number) => actions.patch({ dateKey: today, water: Math.max(0, Math.min(40, n)) });
  const pct = Math.min(100, Math.round((water / goal) * 100));
  return (
    <section className="card stack-sm water-card" aria-labelledby="water-title">
      <h2 id="water-title" className="list-count">
        <GlassWater size={18} aria-hidden="true" /> Agua de hoy
      </h2>
      <p className="water-card__count" aria-live="polite">
        <span className="numeric">{water}</span>
        <span className="muted small"> de {goal} vasos</span>
      </p>
      <Meter value={pct} label="Agua de hoy" color="var(--legacy-blue)" />
      <div className="water-card__actions">
        <button type="button" className="btn btn--secondary" onClick={() => set(water - 1)} disabled={water <= 0} aria-label="Quitar un vaso">
          <Minus size={18} aria-hidden="true" />
        </button>
        <button type="button" className="btn" onClick={() => set(water + 1)} disabled={water >= 40}>
          <Plus size={18} aria-hidden="true" /> Un vaso
        </button>
      </div>
      <SelectField label="Meta diaria" value={goal} onChange={(e) => actions.patch({ waterGoal: Number(e.target.value) })}>
        {Array.from({ length: 40 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? 'vaso' : 'vasos'}
          </option>
        ))}
      </SelectField>
    </section>
  );
}

// En la columna lateral solo cabe un botón: borrar está en el diálogo de edición, con confirmación.
function MealRow({ meal: m, onEdit }: { meal: LegacyMeal; onEdit: () => void }) {
  const label = `${m.label || 'Comida'}${m.time ? ` de las ${m.time}` : ''}`;
  return (
    <li>
      <span className="routine-row__time numeric small">{m.time || '—'}</span>
      <span className="day-item__text">
        <strong>{m.label || 'Comida'}</strong>
        {m.note && <span className="muted small">{m.note}</span>}
      </span>
      <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar ${label}`}>
        <Pencil size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

function RoutineForm({ routine, day, onDone }: { routine: LegacyRoutine | null; day: number; onDone: () => void }) {
  const actions = useModule('routines');
  const [title, setTitle] = useState(routine?.title ?? '');
  const [time, setTime] = useState(routine?.time ?? '08:00');
  // Una rutina nueva desde un día concreto empieza en todos los días (como la app anterior).
  const [days, setDays] = useState(validDays(routine?.days));
  const valid = !!title.trim() && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const fields = { title: title.trim(), time, days };
    if (routine) actions.update(routine.id, fields);
    else actions.add({ id: newId(), ...fields, icon: 'bell', sound: true, enabled: true });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Qué haces" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus placeholder="Tomar vitaminas" />
      <TextField label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      <WeekdayPicker legend="Días" value={days} onChange={setDays} hint={day && !days.includes(String(day)) ? `${daysLabel(days)} · no incluye el día que estás viendo` : undefined} />
      <FormActions
        submitLabel={routine ? 'Guardar' : 'Añadir rutina'}
        disabled={!valid}
        onDelete={
          routine
            ? () => {
                actions.remove(routine.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará «${routine?.title || 'esta rutina'}».`}
      />
    </form>
  );
}

function MealForm({ meal, today, onDone }: { meal: LegacyMeal | null; today: string; onDone: () => void }) {
  const actions = useModule('meals');
  const [label, setLabel] = useState(meal?.label || 'Comida');
  const [time, setTime] = useState(meal?.time ?? localTime());
  const [note, setNote] = useState(meal?.note ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { label, time, note: note.trim() };
    if (meal) actions.update(meal.id, fields);
    else actions.add({ id: newId(), ...fields, dateKey: today });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="grid-2">
        <SelectField label="Comida" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus>
          {optionsWith(MEAL_LABELS, label).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </SelectField>
        <TextField label="Hora (opcional)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <TextField label="Qué comiste (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Avena con fruta" />
      <FormActions
        submitLabel={meal ? 'Guardar' : 'Añadir comida'}
        onDelete={
          meal
            ? () => {
                actions.remove(meal.id);
                onDone();
              }
            : undefined
        }
        confirm="Se borrará esta comida."
      />
    </form>
  );
}

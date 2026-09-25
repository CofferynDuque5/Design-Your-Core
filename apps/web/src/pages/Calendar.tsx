import { addDays, COLOR_NAMES, cycleInfo, cyclePredictions, isDay, isoWeekday, legacyList, legacyObject, longDay, monthLabel, PERIOD_FLOW_INFO, REMINDER_COLORS, type Day, type LegacyReminder } from '@dyc/core';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useSession } from '../app/session';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { ColorPicker, SelectField, TextField } from '../components/Form';
import { ErrorState, Loading } from '../components/States';
import { localDayKey } from '../lib/tools';

// Marcas de solo lectura que vienen de otras secciones de la app anterior.
const MARKS = {
  event: { label: 'Evento', className: 'mark--event' },
  workout: { label: 'Entreno', className: 'mark--workout' },
  goal: { label: 'Meta', className: 'mark--goal' },
  journal: { label: 'Diario', className: 'mark--journal' },
  // Solo si Ciclo está activado, como en la app anterior (`user.showCycle`).
  period: { label: 'Regla', className: 'mark--period' },
  predicted: { label: 'Regla prevista', className: 'mark--predicted' },
} as const;
type MarkKind = keyof typeof MARKS;

const WEEK_HEAD = [
  ['L', 'lunes'],
  ['M', 'martes'],
  ['X', 'miércoles'],
  ['J', 'jueves'],
  ['V', 'viernes'],
  ['S', 'sábado'],
  ['D', 'domingo'],
] as const;

interface Workout {
  date?: unknown;
  plan?: unknown;
  minutes?: unknown;
}
interface Goal {
  deadline?: unknown;
  title?: unknown;
}
interface Journal {
  date?: unknown;
  mood?: unknown;
  note?: unknown;
  gratitude?: unknown;
}

const arr = <T,>(data: Record<string, unknown>, key: string): T[] => (Array.isArray(data[key]) ? (data[key] as T[]).filter((x) => x && typeof x === 'object') : []);
const daysInMonth = (month: Day) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const shiftMonth = (month: Day, n: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};

export function Calendar() {
  const legacy = useLegacyData();
  const today = localDayKey(new Date());
  const [month, setMonth] = useState<Day>(`${today.slice(0, 7)}-01`);
  const [selected, setSelected] = useState<Day>(today);
  const [editing, setEditing] = useState<LegacyReminder | 'new' | null>(null);
  const data = legacy.data?.data ?? {};
  const reminders = useLegacyList(legacy.data?.data, 'reminders');
  const showCycle = !!useSession().user?.showCycle;
  // Regla registrada y prevista (misma estimación que en Ciclo; ver docs/modulos.md).
  const cycleDays = useMemo(() => {
    if (!showCycle) return { period: new Set<Day>(), predicted: new Set<Day>() };
    const d = legacy.data?.data ?? {};
    const period = legacyList(d, 'period');
    const cycle = legacyObject(d, 'cycle');
    const registered = new Set(period.map((p) => p.date).filter(isDay));
    const end = addDays(month, daysInMonth(month) - 1);
    return { period: registered, predicted: cyclePredictions(cycleInfo(period, cycle, today), cycle, month, end, registered).period };
  }, [showCycle, legacy.data, month, today]);

  // Qué hay cada día del mes visible.
  const marks = useMemo(() => {
    const byDay = new Map<Day, Set<MarkKind>>();
    const add = (d: unknown, k: MarkKind) => {
      if (typeof d !== 'string' || !d.startsWith(month.slice(0, 7))) return;
      const key = d.slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? new Set()).add(k));
    };
    // Los eventos solo guardan el día del mes: se repiten todos los meses.
    for (const r of legacyList(legacy.data?.data, 'reminders')) {
      if (r.on !== false && Number.isInteger(r.day) && r.day >= 1 && r.day <= daysInMonth(month)) add(`${month.slice(0, 8)}${String(r.day).padStart(2, '0')}`, 'event');
    }
    const d = legacy.data?.data ?? {};
    arr<Workout>(d, 'workouts').forEach((w) => add(w.date, 'workout'));
    arr<Goal>(d, 'goals').forEach((g) => add(g.deadline, 'goal'));
    arr<Journal>(d, 'journal').forEach((j) => add(j.date, 'journal'));
    cycleDays.period.forEach((day) => add(day, 'period'));
    cycleDays.predicted.forEach((day) => add(day, 'predicted'));
    return byDay;
  }, [legacy.data, month, cycleDays]);

  const n = daysInMonth(month);
  const lead = isoWeekday(month) - 1;
  const cells: Array<Day | null> = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => addDays(month, i))];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const go = (delta: number) => {
    const m = shiftMonth(month, delta);
    setMonth(m);
    setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
  };

  const describe = (d: Day) => {
    const set = marks.get(d);
    if (!set) return '';
    const dayNum = Number(d.slice(8));
    const events = reminders.filter((r) => r.on !== false && r.day === dayNum).length;
    const parts = [...set].map((k) => (k === 'event' ? `${events} ${events === 1 ? 'evento' : 'eventos'}` : MARKS[k].label.toLowerCase()));
    return `: ${parts.join(', ')}`;
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Herramientas" title="Calendario">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nuevo evento
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tu calendario" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="calendar-layout">
          <section className="card stack" aria-labelledby="month-title">
            <div className="month-nav">
              <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label="Mes anterior">
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <h2 id="month-title" className="section-title" aria-live="polite">
                {monthLabel(month)}
              </h2>
              <button type="button" className="icon-btn" onClick={() => go(1)} aria-label="Mes siguiente">
                <ChevronRight size={20} aria-hidden="true" />
              </button>
              {month.slice(0, 7) !== today.slice(0, 7) && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setMonth(`${today.slice(0, 7)}-01`);
                    setSelected(today);
                  }}
                >
                  Hoy
                </button>
              )}
            </div>
            <table className="month">
              <caption className="visually-hidden">{monthLabel(month)}. Elige un día para ver lo que tiene.</caption>
              <thead>
                <tr>
                  {WEEK_HEAD.map(([short, long]) => (
                    <th key={long} scope="col" abbr={long}>
                      {short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((w, i) => (
                  <tr key={i}>
                    {w.map((d, j) => (
                      <td key={j}>
                        {d && (
                          <button
                            type="button"
                            className={`month__day${d === today ? ' month__day--today' : ''}`}
                            aria-pressed={d === selected}
                            aria-current={d === today ? 'date' : undefined}
                            aria-label={`${longDay(d)}${describe(d)}`}
                            onClick={() => setSelected(d)}
                          >
                            <span className="month__num">{Number(d.slice(8))}</span>
                            <span className="month__marks" aria-hidden="true">
                              {[...(marks.get(d) ?? [])].map((k) => (
                                <span key={k} className={`mark ${MARKS[k].className}`} />
                              ))}
                            </span>
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="legend legend--row" aria-label="Leyenda">
              {(Object.keys(MARKS) as MarkKind[]).filter((k) => showCycle || (k !== 'period' && k !== 'predicted')).map((k) => (
                <li key={k}>
                  <span className={`mark ${MARKS[k].className}`} aria-hidden="true" />
                  {MARKS[k].label}
                </li>
              ))}
            </ul>
          </section>
          <DayPanel day={selected} data={data} reminders={reminders} onEdit={setEditing} cycle={showCycle ? { period: cycleDays.period.has(selected), predicted: cycleDays.predicted.has(selected) } : null} />
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo evento' : 'Editar evento'}>
        {editing !== null && <EventForm event={editing === 'new' ? null : editing} day={Number(selected.slice(8))} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function DayPanel({
  day,
  data,
  reminders,
  onEdit,
  cycle,
}: {
  day: Day;
  data: Record<string, unknown>;
  reminders: LegacyReminder[];
  onEdit: (r: LegacyReminder) => void;
  cycle: { period: boolean; predicted: boolean } | null;
}) {
  const actions = useModule('reminders');
  const dayNum = Number(day.slice(8));
  const events = reminders.filter((r) => r.day === dayNum);
  const workouts = arr<Workout>(data, 'workouts').filter((w) => w.date === day);
  const goals = arr<Goal>(data, 'goals').filter((g) => g.deadline === day);
  const journal = arr<Journal>(data, 'journal').filter((j) => j.date === day);
  const periodDay = cycle?.period ? legacyList(data, 'period').find((p) => p.date === day) : undefined;
  const empty = !events.length && !workouts.length && !goals.length && !journal.length && !cycle?.period && !cycle?.predicted;

  return (
    <section className="card stack" aria-labelledby="day-panel-title">
      <div className="stack-xs">
        <h2 id="day-panel-title" className="section-title">
          {longDay(day)}
        </h2>
        <p className="muted small">Los eventos se repiten cada mes en el mismo día, como en la app anterior.</p>
      </div>
      {empty ? (
        <p className="muted">Nada este día.</p>
      ) : (
        <ul className="day-items">
          {events.map((r) => (
            <li key={r.id} className={`day-item${r.on === false ? ' day-item--off' : ''}`}>
              <span className="swatch-dot" style={{ ['--c' as string]: r.color }} aria-hidden="true" />
              <span className="day-item__text">
                <strong>{r.title}</strong>
                <span className="muted small">
                  {r.when ? `${r.when} · ` : ''}día {r.day} de cada mes{r.on === false ? ' · desactivado' : ''}
                </span>
              </span>
              <label className="switch">
                <input type="checkbox" role="switch" checked={r.on !== false} onChange={() => actions.update(r.id, { on: r.on === false })} />
                <span aria-hidden="true" />
                <span className="visually-hidden">Activo: «{r.title}»</span>
              </label>
              <button type="button" className="icon-btn" onClick={() => onEdit(r)} aria-label={`Editar «${r.title}»`}>
                <Pencil size={18} aria-hidden="true" />
              </button>
              <button type="button" className="icon-btn" onClick={() => actions.remove(r.id)} aria-label={`Borrar «${r.title}»`}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
          {workouts.map((w, i) => (
            <li key={`w${i}`} className="day-item">
              <span className="mark mark--workout" aria-hidden="true" />
              <span className="day-item__text">
                <strong>Entreno{typeof w.plan === 'string' && w.plan ? `: ${w.plan}` : ''}</strong>
                {typeof w.minutes === 'number' && <span className="muted small">{w.minutes} min</span>}
              </span>
            </li>
          ))}
          {goals.map((g, i) => (
            <li key={`g${i}`} className="day-item">
              <span className="mark mark--goal" aria-hidden="true" />
              <span className="day-item__text">
                <strong>Meta: {String(g.title ?? '')}</strong>
                <span className="muted small">Fecha límite</span>
              </span>
            </li>
          ))}
          {cycle?.period && (
            <li className="day-item">
              <span className="mark mark--period" aria-hidden="true" />
              <span className="day-item__text">
                <strong>Regla</strong>
                <span className="muted small">
                  Flujo {(PERIOD_FLOW_INFO[periodDay?.flow as keyof typeof PERIOD_FLOW_INFO] ?? PERIOD_FLOW_INFO.medium).label.toLowerCase()} · <Link to="/ciclo">Ver en Ciclo</Link>
                </span>
              </span>
            </li>
          )}
          {cycle?.predicted && (
            <li className="day-item">
              <span className="mark mark--predicted" aria-hidden="true" />
              <span className="day-item__text">
                <strong>Regla prevista</strong>
                <span className="muted small">
                  Estimación, no consejo médico · <Link to="/ciclo">Ver en Ciclo</Link>
                </span>
              </span>
            </li>
          )}
          {journal.map((j, i) => (
            <li key={`j${i}`} className="day-item">
              <span className="mark mark--journal" aria-hidden="true" />
              <span className="day-item__text">
                <strong>Diario {typeof j.mood === 'string' ? j.mood : ''}</strong>
                {typeof j.note === 'string' && j.note && <span className="muted small clamp-2">{j.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventForm({ event, day: initialDay, onDone }: { event: LegacyReminder | null; day: number; onDone: () => void }) {
  const actions = useModule('reminders');
  const [title, setTitle] = useState(event?.title ?? '');
  const [when, setWhen] = useState(event?.when ?? '');
  const [day, setDay] = useState(event?.day ?? initialDay);
  const [color, setColor] = useState<string>(event?.color && (REMINDER_COLORS as readonly string[]).includes(event.color) ? event.color : REMINDER_COLORS[0]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { title: title.trim(), when: when.trim(), day, color };
    if (event) actions.update(event.id, fields);
    else actions.add({ id: newId(), ...fields, icon: 'doc', on: true });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus placeholder="Dentista" />
      <div className="grid-2">
        <TextField label="Hora o nota (opcional)" value={when} onChange={(e) => setWhen(e.target.value)} maxLength={60} placeholder="14:00" />
        <SelectField label="Día del mes" value={day} onChange={(e) => setDay(Number(e.target.value))} hint={`Se repite el día ${day} de cada mes.`}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </SelectField>
      </div>
      <ColorPicker legend="Color" colors={REMINDER_COLORS} value={color} onChange={setColor} names={COLOR_NAMES} />
      <div className="form-actions">
        <button type="submit" className="btn" disabled={!title.trim()}>
          {event ? 'Guardar' : 'Añadir evento'}
        </button>
      </div>
    </form>
  );
}

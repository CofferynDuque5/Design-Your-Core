import { CLASS_COLORS, CLASS_DAYS, COLOR_NAMES, hhmmToHours, type LegacyClass } from '@dyc/core';
import { Clock, MapPin, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { ColorPicker, SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { durationLabel, isoDay, layoutLanes, nowHours, useNow } from '../lib/tools';

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HOUR = 52; // px por hora
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Subject {
  id: string;
  name: string;
  color?: string;
  room?: string;
}

const validClass = (c: LegacyClass) => Number.isInteger(c.day) && c.day >= 1 && c.day <= 7 && TIME_RE.test(c.start) && TIME_RE.test(c.end) && c.end > c.start;
const byStart = (a: LegacyClass, b: LegacyClass) => a.start.localeCompare(b.start);

/** La clase en curso o la siguiente de la semana (las clases se repiten cada semana). */
function nextClass(classes: LegacyClass[], now: Date) {
  const nowMin = (isoDay(now) - 1) * 1440 + now.getHours() * 60 + now.getMinutes();
  let best: { c: LegacyClass; wait: number; ongoing: boolean } | null = null;
  for (const c of classes) {
    const start = (c.day - 1) * 1440 + hhmmToHours(c.start) * 60;
    const end = (c.day - 1) * 1440 + hhmmToHours(c.end) * 60;
    const ongoing = nowMin >= start && nowMin < end;
    const wait = ongoing ? -1 : (start - nowMin + 7 * 1440) % (7 * 1440);
    if (!best || wait < best.wait) best = { c, wait, ongoing };
  }
  return best;
}

function whenLabel(c: LegacyClass, wait: number, ongoing: boolean, now: Date) {
  if (ongoing) return `Ahora, hasta las ${c.end}`;
  const today = isoDay(now);
  const inDays = (c.day - today + 7) % 7;
  if (inDays === 0 && wait < 1440) return `Hoy a las ${c.start} · en ${durationLabel(Math.max(wait, 1) / 60)}`;
  if (inDays === 1) return `Mañana a las ${c.start}`;
  return `${DAY_NAMES[c.day - 1]} a las ${c.start}`;
}

export function Schedule() {
  const legacy = useLegacyData();
  const all = useLegacyList(legacy.data?.data, 'classes');
  const classes = all.filter(validClass);
  const [editing, setEditing] = useState<LegacyClass | 'new' | null>(null);
  const now = useNow();
  const today = isoDay(now);

  const from = Math.min(7, ...classes.map((c) => Math.floor(hhmmToHours(c.start))));
  const to = Math.max(from + 1, ...classes.map((c) => Math.ceil(hhmmToHours(c.end))));
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const nowH = nowHours(now);
  const next = nextClass(classes, now);
  const describe = (c: LegacyClass) => `${c.title}, ${DAY_NAMES[c.day - 1].toLowerCase()} de ${c.start} a ${c.end}${c.room ? `, aula ${c.room}` : ''}. Editar`;

  return (
    <div className="page">
      <PageHeader eyebrow="Herramientas" title="Horario">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nueva clase
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tu horario" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : classes.length === 0 ? (
        <EmptyState title="Tu horario está vacío">Añade tus clases: se repiten cada semana en el mismo día y hora.</EmptyState>
      ) : (
        <div className="stack-lg">
          {next && (
            <section className="card card--accent next-class" aria-labelledby="next-class-title" style={{ ['--c' as string]: next.c.color }}>
              <p id="next-class-title" className="eyebrow">
                {next.ongoing ? 'Clase en curso' : 'Próxima clase'}
              </p>
              <div className="next-class__body">
                <span className="swatch-dot swatch-dot--lg" aria-hidden="true" />
                <div className="stack-xs">
                  <strong className="next-class__title">{next.c.title}</strong>
                  <span className="row small muted">
                    <span className="row">
                      <Clock size={14} aria-hidden="true" /> {whenLabel(next.c, next.wait, next.ongoing, now)}
                    </span>
                    {next.c.room && (
                      <span className="row">
                        <MapPin size={14} aria-hidden="true" /> {next.c.room}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Cuadrícula semanal (pantallas anchas) */}
          <section className="card week-grid-card" aria-labelledby="week-title">
            <h2 id="week-title" className="visually-hidden">
              Semana
            </h2>
            <div className="week-grid">
              <div className="week-grid__corner" aria-hidden="true" />
              {CLASS_DAYS.map((d, i) => (
                <div key={d} className={`week-grid__head${i + 1 === today ? ' week-grid__head--today' : ''}`} aria-hidden="true">
                  {d}
                </div>
              ))}
              <div className="week-grid__hours" style={{ height: (to - from) * HOUR }} aria-hidden="true">
                {hours.map((h) => (
                  <span key={h} className="timeline__hour" style={{ top: (h - from) * HOUR }}>
                    {h}:00
                  </span>
                ))}
              </div>
              {DAY_NAMES.map((name, i) => {
                const day = i + 1;
                const placed = layoutLanes(classes.filter((c) => c.day === day).map((c) => ({ item: c, start: hhmmToHours(c.start), end: hhmmToHours(c.end) })));
                return (
                  <div key={name} className={`week-grid__col${day === today ? ' week-grid__col--today' : ''}`} style={{ height: (to - from) * HOUR }}>
                    <ul aria-label={name}>
                      {placed.map(({ item: c, start, end, lane, lanes }) => (
                        <li
                          key={c.id}
                          className={`tl-block${end - start < 0.75 ? ' tl-block--short' : ''}`}
                          style={{
                            top: (start - from) * HOUR,
                            height: (end - start) * HOUR - 2,
                            left: `calc(${(lane / lanes) * 100}% + 2px)`,
                            width: `calc(${100 / lanes}% - 4px)`,
                            ['--c' as string]: c.color,
                          }}
                        >
                          <button type="button" className="tl-block__btn" onClick={() => setEditing(c)} aria-label={describe(c)}>
                            <span className="tl-block__label">{c.title}</span>
                            {end - start >= 0.75 && (
                              <span className="tl-block__meta">
                                {c.start}
                                {c.room ? ` · ${c.room}` : ''}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {day === today && nowH >= from && nowH <= to && <div className="now-line" style={{ top: (nowH - from) * HOUR }} aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Lista por días (móvil) */}
          <div className="day-list stack">
            {DAY_NAMES.map((name, i) => {
              const list = classes.filter((c) => c.day === i + 1).sort(byStart);
              if (!list.length) return null;
              return (
                <section key={name} className="card card--list" aria-labelledby={`day-${i}`}>
                  <h2 id={`day-${i}`} className="list-count">
                    {name}
                    {i + 1 === today && <span className="chip chip--today">Hoy</span>}
                  </h2>
                  <ul>
                    {list.map((c) => (
                      <li key={c.id}>
                        <button type="button" className="class-row" onClick={() => setEditing(c)} aria-label={describe(c)} style={{ ['--c' as string]: c.color }}>
                          <span className="class-row__time numeric">
                            {c.start}
                            <span className="muted">{c.end}</span>
                          </span>
                          <span className="class-row__bar" aria-hidden="true" />
                          <span className="stack-xs">
                            <strong>{c.title}</strong>
                            {c.room && <span className="muted small">{c.room}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva clase' : 'Editar clase'}>
        {editing !== null && <ClassForm cls={editing === 'new' ? null : editing} count={all.length} subjects={subjectsOf(legacy.data?.data)} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function subjectsOf(data: Record<string, unknown> | undefined): Subject[] {
  const list = data?.subjects;
  return Array.isArray(list) ? list.filter((s): s is Subject => !!s && typeof s.id === 'string' && typeof s.name === 'string') : [];
}

function ClassForm({ cls, count, subjects, onDone }: { cls: LegacyClass | null; count: number; subjects: Subject[]; onDone: () => void }) {
  const actions = useModule('classes');
  const [subject, setSubject] = useState(cls?.subject && subjects.some((s) => s.id === cls.subject) ? cls.subject : '');
  const [title, setTitle] = useState(cls?.title ?? '');
  const [day, setDay] = useState(cls?.day ?? 1);
  const [start, setStart] = useState(cls?.start ?? '08:00');
  const [end, setEnd] = useState(cls?.end ?? '09:30');
  const [room, setRoom] = useState(cls?.room ?? '');
  // Color cíclico de la paleta para clases nuevas, como la app anterior.
  const [color, setColor] = useState(cls?.color ?? CLASS_COLORS[count % CLASS_COLORS.length]);
  const palette = CLASS_COLORS.some((c) => c.toLowerCase() === color.toLowerCase()) ? [...CLASS_COLORS] : [...CLASS_COLORS, color];
  const badTime = !TIME_RE.test(start) || !TIME_RE.test(end) || end <= start;

  const pickSubject = (id: string) => {
    setSubject(id);
    const s = subjects.find((x) => x.id === id);
    if (!s) return;
    // Como la app anterior: copia nombre, color y aula de la materia.
    setTitle(s.name);
    if (s.color && /^#[0-9A-Fa-f]{6}$/.test(s.color)) setColor(s.color);
    if (s.room) setRoom(s.room);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { title: title.trim(), day, start, end, room: room.trim(), color, subject };
    if (cls) actions.update(cls.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      {subjects.length > 0 && (
        <SelectField label="Materia" value={subject} onChange={(e) => pickSubject(e.target.value)}>
          <option value="">Clase suelta</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      )}
      <TextField label="Nombre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus placeholder="Cálculo" />
      <SelectField label="Día" value={day} onChange={(e) => setDay(Number(e.target.value))}>
        {DAY_NAMES.map((n, i) => (
          <option key={n} value={i + 1}>
            {n}
          </option>
        ))}
      </SelectField>
      <div className="grid-2">
        <TextField label="Empieza" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        <TextField label="Termina" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required error={badTime && TIME_RE.test(start) && TIME_RE.test(end) ? 'Debe ser después de la hora de inicio.' : null} />
      </div>
      <TextField label="Aula (opcional)" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={60} placeholder="A-201" />
      <ColorPicker legend="Color" colors={palette} value={color} onChange={setColor} names={COLOR_NAMES} />
      <div className="form-actions">
        {cls && (
          <button
            type="button"
            className="btn btn--ghost danger-text"
            onClick={() => {
              actions.remove(cls.id);
              onDone();
            }}
          >
            <Trash2 size={16} aria-hidden="true" /> Borrar
          </button>
        )}
        <button type="submit" className="btn" disabled={!title.trim() || badTime}>
          {cls ? 'Guardar' : 'Añadir clase'}
        </button>
      </div>
    </form>
  );
}

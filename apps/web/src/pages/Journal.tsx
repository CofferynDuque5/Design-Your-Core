import { addDays, isDay, JOURNAL_MOODS, longDay, shortDay, utcDayKey, type LegacyJournal } from '@dyc/core';
import { Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { TextArea, TextField } from '../components/Form';
import { ErrorState, Loading } from '../components/States';
import { CheckInNote, MoodPicker, Stats } from '../components/ToolParts';
import { useAutosave } from '../lib/tools';

const HISTORY_MAX = 60;
type Fields = Partial<Pick<LegacyJournal, 'mood' | 'gratitude' | 'note'>>;

export function Journal() {
  const legacy = useLegacyData();
  const journal = useLegacyList(legacy.data?.data, 'journal');
  const actions = useModule('journal');
  const toast = useToast();
  // Una entrada por fecha, con el día en UTC como la app anterior.
  const today = utcDayKey();
  const [date, setDate] = useState(today);
  const entries = useMemo(() => journal.filter((j) => isDay(j.date)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [journal]);
  const entry = entries.find((j) => j.date === date);
  // La app anterior creaba la entrada al abrir la sección; aquí se crea con lo primero que escribes.
  const created = useRef(new Map<string, string>());

  const save = (fields: Fields) => {
    const id = entry?.id ?? created.current.get(date);
    if (id) return actions.update(id, fields);
    const fresh = newId();
    created.current.set(date, fresh);
    actions.add({ id: fresh, date, mood: '', gratitude: '', note: '', ...fields });
  };

  const remove = (j: LegacyJournal) => {
    const order = journal.map((x) => x.id);
    created.current.delete(j.date);
    actions.remove(j.id);
    toast(`Entrada del ${shortDay(j.date)} eliminada.`, {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(j);
          actions.reorder(order);
        },
      },
    });
  };

  const stats = useMemo(() => {
    const days = new Set(entries.map((e) => e.date));
    let day = days.has(today) ? today : addDays(today, -1);
    let streak = 0;
    while (days.has(day)) {
      streak++;
      day = addDays(day, -1);
    }
    const counts = new Map<string, number>();
    for (const e of entries.slice(0, 30)) if (e.mood) counts.set(e.mood, (counts.get(e.mood) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { month: entries.filter((e) => e.date.startsWith(today.slice(0, 7))).length, streak, top };
  }, [entries, today]);
  const topLabel = JOURNAL_MOODS.find((m) => m.emoji === stats.top)?.label;

  return (
    <div className="page">
      <PageHeader eyebrow="Salud" title="Diario" />
      {legacy.isPending ? (
        <Loading label="Cargando tu diario" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          <Stats
            items={[
              { value: stats.month, label: stats.month === 1 ? 'Entrada este mes' : 'Entradas este mes' },
              { value: stats.streak, label: stats.streak === 1 ? 'Día seguido' : 'Días seguidos' },
              { value: stats.top ? <span className="emoji" aria-hidden="true">{stats.top}</span> : '—', label: topLabel ? `Ánimo más frecuente: ${topLabel.toLowerCase()}` : 'Ánimo más frecuente' },
            ]}
          />
          <div className="journal-layout">
            <Editor key={date} date={date} today={today} entry={entry} onSave={save} onDate={setDate} />
            <section className="card card--list" aria-labelledby="journal-history">
              <h2 id="journal-history" className="list-count">
                Entradas <span className="chip small numeric">{entries.length}</span>
              </h2>
              {entries.length === 0 ? (
                <p className="muted small recent-empty">Tus entradas aparecerán aquí. Empieza con cómo te sientes hoy.</p>
              ) : (
                <ul className="journal-list">
                  {entries.slice(0, HISTORY_MAX).map((j) => {
                    const mood = JOURNAL_MOODS.find((m) => m.emoji === j.mood);
                    const text = j.note?.trim() || j.gratitude?.trim() || 'Sin texto';
                    return (
                      <li key={j.id} className={j.date === date ? 'journal-list__item journal-list__item--on' : 'journal-list__item'}>
                        <button type="button" className="journal-list__open" onClick={() => setDate(j.date)} aria-current={j.date === date ? 'true' : undefined}>
                          <span className="journal-list__mood emoji" aria-hidden="true">
                            {j.mood || '·'}
                          </span>
                          <span className="day-item__text">
                            <strong>
                              {shortDay(j.date)}
                              {j.date === today ? ' · hoy' : ''}
                              {mood ? <span className="visually-hidden">, ánimo {mood.label.toLowerCase()}</span> : null}
                            </strong>
                            <span className="muted small clamp-2">{text}</span>
                          </span>
                        </button>
                        <button type="button" className="icon-btn" onClick={() => remove(j)} aria-label={`Borrar la entrada del ${shortDay(j.date)}`}>
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
          <CheckInNote>El check-in diario guarda aparte su propia reflexión y gratitud; tu diario no cambia aún tus pilares.</CheckInNote>
        </div>
      )}
    </div>
  );
}

function Editor({ date, today, entry, onSave, onDate }: { date: string; today: string; entry: LegacyJournal | undefined; onSave: (f: Fields) => void; onDate: (d: string) => void }) {
  // Como la app anterior, se guarda solo mientras escribes (espera corta de 400 ms).
  const gratitude = useAutosave(entry?.gratitude ?? '', (v) => v !== (entry?.gratitude ?? '') && onSave({ gratitude: v }), 400);
  const note = useAutosave(entry?.note ?? '', (v) => v !== (entry?.note ?? '') && onSave({ note: v }), 400);
  return (
    <section className="card stack" aria-labelledby="journal-day">
      <div className="journal-head">
        <h2 id="journal-day" className="section-title">
          {date === today ? 'Hoy' : longDay(date)}
          {date === today && <span className="muted small journal-head__date"> · {longDay(date)}</span>}
        </h2>
        <div className="journal-head__nav">
          <TextField label="Ir a otro día" type="date" value={date} max={today} onChange={(e) => isDay(e.target.value) && onDate(e.target.value)} />
          {date !== today && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDate(today)}>
              Volver a hoy
            </button>
          )}
        </div>
      </div>
      <MoodPicker legend="¿Cómo te sientes?" moods={JOURNAL_MOODS} value={entry?.mood ?? ''} onChange={(mood) => onSave({ mood })} />
      <TextArea label="Hoy agradezco…" rows={2} maxLength={5000} value={gratitude.draft} onChange={(e) => gratitude.change(e.target.value)} onBlur={gratitude.flush} placeholder="Una persona, un momento, algo pequeño" />
      <TextArea label="Notas del día" rows={6} maxLength={50_000} value={note.draft} onChange={(e) => note.change(e.target.value)} onBlur={note.flush} placeholder="¿Qué pasó hoy? ¿Qué aprendiste?" />
      <p className="muted small">{entry ? 'Se guarda solo mientras escribes.' : 'Aún no hay entrada de este día: se crea con lo primero que escribas.'}</p>
    </section>
  );
}

import { byDateDesc, isDay, shortDay, sleepMinutes, sleepQualityLabel as qualityLabel, sleepStats, utcDayKey, type LegacySleep } from '@dyc/core';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { Scale, TextArea, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { CheckInNote, FormActions, Stats } from '../components/ToolParts';
import { minutesLabel } from '../lib/tools';

const HISTORY_MAX = 60;
const CHART_NIGHTS = 14;
const HOURS = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });

export function Sleep() {
  const legacy = useLegacyData();
  const nights = useLegacyList(legacy.data?.data, 'sleep');
  const actions = useModule('sleep');
  const toast = useToast();
  const today = utcDayKey();
  const stats = useMemo(() => sleepStats(nights), [nights]);
  const history = useMemo(() => [...nights].filter((n) => isDay(n.date)).sort(byDateDesc), [nights]);
  const chart = history.slice(0, CHART_NIGHTS).reverse();
  const [editing, setEditing] = useState<LegacySleep | 'new' | null>(null);
  const last = history[0];
  const lastMinutes = last ? sleepMinutes(last.bedtime, last.waketime) : null;

  const remove = (n: LegacySleep) => {
    const order = nights.map((x) => x.id);
    actions.remove(n.id);
    toast('Noche eliminada.', {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(n);
          actions.reorder(order);
        },
      },
    });
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Salud" title="Sueño">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Registrar noche
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus noches" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : history.length === 0 ? (
        <div className="stack-lg">
          <EmptyState
            title="Aún no has registrado noches"
            action={
              <button type="button" className="btn btn--secondary" onClick={() => setEditing('new')}>
                <Plus size={18} aria-hidden="true" /> Registrar la de anoche
              </button>
            }
          >
            Apunta a qué hora te acostaste y te levantaste y cómo dormiste. Verás tu media de las últimas dos semanas.
          </EmptyState>
          <CheckInNote>El check-in diario registra aparte tus horas de sueño para el pilar Descanso.</CheckInNote>
        </div>
      ) : (
        <div className="stack-lg">
          <Stats
            items={[
              { value: stats.avgMinutes === null ? '—' : minutesLabel(Math.round(stats.avgMinutes)), label: `Media de las últimas ${stats.nights} ${stats.nights === 1 ? 'noche' : 'noches'}` },
              { value: stats.avgQuality === null ? '—' : `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(stats.avgQuality)}/5`, label: 'Calidad media' },
              { value: lastMinutes === null ? '—' : minutesLabel(lastMinutes), label: `Última noche · ${shortDay(last.date)}` },
            ]}
          />
          <section className="card stack-sm" aria-labelledby="sleep-chart-title">
            <h2 id="sleep-chart-title" className="list-count">
              Horas por noche
            </h2>
            <ol className="sleep-bars" aria-label={`Últimas ${chart.length} noches`}>
              {chart.map((n) => {
                const m = sleepMinutes(n.bedtime, n.waketime) ?? 0;
                return (
                  <li key={n.id} style={{ ['--h' as string]: Math.min(1, m / 600) }} data-quality={n.quality} title={`${shortDay(n.date)}: ${minutesLabel(m)} · ${qualityLabel(n.quality)}`}>
                    <span className="visually-hidden">
                      {shortDay(n.date)}: {minutesLabel(m)}, calidad {qualityLabel(n.quality)}
                    </span>
                    <span className="sleep-bars__value numeric" aria-hidden="true">
                      {HOURS.format(m / 60)}
                    </span>
                    <span className="sleep-bars__bar" aria-hidden="true" />
                    <span className="sleep-bars__day" aria-hidden="true">
                      {shortDay(n.date).split(' ')[0]}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="muted small">Cada barra es una noche (hasta 10 h); cuanto más intenso el color, mejor dormiste. La línea marca 8 horas.</p>
          </section>
          <section className="card card--list" aria-labelledby="sleep-history">
            <h2 id="sleep-history" className="list-count">
              Historial <span className="chip small numeric">{history.length}</span>
            </h2>
            <ul className="day-items">
              {history.slice(0, HISTORY_MAX).map((n) => {
                const m = sleepMinutes(n.bedtime, n.waketime);
                const label = `la noche del ${shortDay(n.date)}`;
                return (
                  <li key={n.id}>
                    <span className="sleep-q numeric" aria-hidden="true">
                      {typeof n.quality === 'number' ? n.quality : '–'}
                    </span>
                    <span className="day-item__text">
                      <strong>
                        {shortDay(n.date)}
                        {n.date === today ? ' · hoy' : ''} · {m === null ? 'horas sin completar' : minutesLabel(m)}
                      </strong>
                      <span className="muted small">
                        {n.bedtime} → {n.waketime} · {qualityLabel(n.quality)}
                        {n.note ? ` · ${n.note}` : ''}
                      </span>
                    </span>
                    <button type="button" className="icon-btn" onClick={() => setEditing(n)} aria-label={`Editar ${label}`}>
                      <Pencil size={18} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => remove(n)} aria-label={`Borrar ${label}`}>
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <CheckInNote>El check-in diario registra aparte tus horas de sueño para el pilar Descanso; estas noches aún no cambian tu puntuación.</CheckInNote>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Registrar noche' : 'Editar noche'}>
        {editing !== null && <SleepForm night={editing === 'new' ? null : editing} today={today} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function SleepForm({ night, today, onDone }: { night: LegacySleep | null; today: string; onDone: () => void }) {
  const actions = useModule('sleep');
  const [date, setDate] = useState(night?.date ?? today);
  const [bedtime, setBedtime] = useState(night?.bedtime ?? '23:00');
  const [waketime, setWaketime] = useState(night?.waketime ?? '07:00');
  const [quality, setQuality] = useState<number | null>(typeof night?.quality === 'number' ? night.quality : 3);
  const [note, setNote] = useState(night?.note ?? '');
  const minutes = sleepMinutes(bedtime, waketime);
  const valid = !!date && minutes !== null && quality !== null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const fields = { date, bedtime, waketime, quality: quality as number, note: note.trim() };
    if (night) actions.update(night.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Día" type="date" value={date} onChange={(e) => setDate(e.target.value)} required hint="El día en que te despertaste." />
      <div className="grid-2">
        <TextField label="Te acostaste" type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} required autoFocus />
        <TextField label="Te levantaste" type="time" value={waketime} onChange={(e) => setWaketime(e.target.value)} required hint={minutes !== null ? `Dormiste ${minutesLabel(minutes)}.` : undefined} />
      </div>
      <Scale legend="¿Cómo dormiste?" value={quality} onChange={setQuality} low="Muy mal" high="Muy bien" />
      <TextArea label="Nota (opcional)" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Me desperté a las 3, café tarde…" />
      <FormActions
        submitLabel={night ? 'Guardar' : 'Registrar'}
        disabled={!valid}
        onDelete={
          night
            ? () => {
                actions.remove(night.id);
                onDone();
              }
            : undefined
        }
        confirm="Se borrará esta noche."
      />
    </form>
  );
}

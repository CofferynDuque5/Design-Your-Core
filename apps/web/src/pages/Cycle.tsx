import {
  addDays,
  cycleInfo,
  cyclePredictions,
  diffDays,
  isDay,
  longDay,
  PERIOD_FLOW_INFO,
  PERIOD_FLOWS,
  PERIOD_MOODS,
  PERIOD_SYMPTOMS,
  periodRuns,
  shortDay,
  splitTags,
  type LegacyPeriodDay,
  type PeriodFlow,
} from '@dyc/core';
import { CalendarPlus, Lock } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useLegacyObject, useModule, useModuleObject } from '../app/legacy';
import { useShowCycle } from '../app/prefs';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Segmented, TextArea, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { MonthNav, MoodPicker, Stats } from '../components/ToolParts';
import { localDayKey, monthWeeks, useAutosave, WEEK_HEAD } from '../lib/tools';

const FLOW_OPTIONS = PERIOD_FLOWS.map((f) => ({ value: f, label: PERIOD_FLOW_INFO[f].label }));
const flowOf = (p: LegacyPeriodDay): PeriodFlow => (PERIOD_FLOWS.includes(p.flow) ? p.flow : 'medium');
/** «24–28 sept» dentro del mismo mes; si no, «30 sept – 3 oct». */
const span = (a: string, b: string) => (a === b ? shortDay(a) : a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))}–${shortDay(b)}` : `${shortDay(a)} – ${shortDay(b)}`);
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const lastOfMonth = (month: string) => addDays(`${month.slice(0, 7)}-01`, new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate() - 1);

export function Cycle() {
  const legacy = useLegacyData();
  const period = useLegacyList(legacy.data?.data, 'period');
  const cycle = useLegacyObject(legacy.data?.data, 'cycle');
  const actions = useModule('period');
  // Ciclo y Calendario usan la fecha LOCAL, como la app anterior.
  const today = localDayKey(new Date());
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [selected, setSelected] = useState(today);
  const byDate = useMemo(() => new Map(period.filter((p) => isDay(p.date)).map((p) => [p.date, p])), [period]);
  const info = useMemo(() => cycleInfo(period, cycle, today), [period, cycle, today]);
  const predicted = useMemo(() => cyclePredictions(info, cycle, `${month.slice(0, 7)}-01`, lastOfMonth(month), byDate.keys()), [info, cycle, month, byDate]);
  const runs = useMemo(() => periodRuns(period), [period]);

  const toggleDay = (d: string) => {
    const p = byDate.get(d);
    if (p) actions.remove(p.id);
    else actions.add({ id: newId(), date: d, flow: 'medium', symptoms: '', mood: '', note: '' });
  };

  const describe = (d: string) => {
    const p = byDate.get(d);
    if (p) return `: regla, flujo ${PERIOD_FLOW_INFO[flowOf(p)].label.toLowerCase()}`;
    if (predicted.period.has(d)) return ': regla prevista';
    if (predicted.fertile.has(d)) return ': ventana fértil estimada';
    return '';
  };

  const changeMonth = (m: string) => {
    setMonth(m);
    setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Salud" title="Ciclo" />
      {legacy.isPending ? (
        <Loading label="Cargando tu ciclo" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          <PrivacyCard />
          {info ? (
            <Stats
              items={[
                { value: `Día ${info.cycleDay}`, label: 'De tu ciclo actual' },
                { value: info.daysUntilNext === 0 ? 'Hoy' : `En ${info.daysUntilNext} ${info.daysUntilNext === 1 ? 'día' : 'días'}`, label: `Próximo periodo estimado · ${shortDay(info.nextStart)}` },
                { value: span(info.fertileStart, info.fertileEnd), label: 'Ventana fértil estimada' },
              ]}
            />
          ) : (
            <EmptyState title="Registra tu primer día de regla">Elige un día en el calendario y márcalo. Con tus registros y la duración de tu ciclo estimamos el próximo periodo.</EmptyState>
          )}
          <p className="estimate-note small">
            <strong>Es una estimación, no un consejo médico.</strong> Se calcula con tus registros y la duración de tu ciclo, y no sirve como método anticonceptivo. Si algo te preocupa, consulta a un profesional de la salud.
          </p>
          <div className="calendar-layout">
            <section className="card stack" aria-labelledby="cycle-month">
              <MonthNav month={month} onChange={changeMonth} current={today} titleId="cycle-month" />
              <table className="month cycle-month">
                <caption className="visually-hidden">Elige un día para registrarlo o ver lo que tiene. Doble clic lo marca o lo quita como día de regla.</caption>
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
                  {monthWeeks(month).map((w, i) => (
                    <tr key={i}>
                      {w.map((d, j) => {
                        const p = d ? byDate.get(d) : undefined;
                        const kind = !d ? '' : p ? ' cycle-day--period' : predicted.period.has(d) ? ' cycle-day--predicted' : predicted.fertile.has(d) ? ' cycle-day--fertile' : '';
                        return (
                          <td key={j}>
                            {d && (
                              <button
                                type="button"
                                className={`month__day cycle-day${kind}${d === today ? ' month__day--today' : ''}`}
                                style={p ? { ['--c' as string]: PERIOD_FLOW_INFO[flowOf(p)].color } : undefined}
                                aria-pressed={d === selected}
                                aria-current={d === today ? 'date' : undefined}
                                aria-label={`${longDay(d)}${describe(d)}`}
                                onClick={() => setSelected(d)}
                                onDoubleClick={() => toggleDay(d)}
                              >
                                <span className="month__num">{Number(d.slice(8))}</span>
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="legend legend--row" aria-label="Leyenda">
                <li>
                  <span className="cycle-key cycle-key--period" aria-hidden="true" />
                  Regla
                </li>
                <li>
                  <span className="cycle-key cycle-key--predicted" aria-hidden="true" />
                  Regla prevista
                </li>
                <li>
                  <span className="cycle-key cycle-key--fertile" aria-hidden="true" />
                  Ventana fértil estimada
                </li>
              </ul>
            </section>
            <DayPanel
              key={`${selected}-${byDate.get(selected)?.id ?? ''}`}
              day={selected}
              entry={byDate.get(selected)}
              status={predicted.period.has(selected) ? 'predicted' : predicted.fertile.has(selected) ? 'fertile' : null}
              onToggle={() => toggleDay(selected)}
            />
          </div>
          <div className="calendar-layout">
            <CycleSettings cycleLength={cycle.cycleLength} periodLength={cycle.periodLength} nextStart={info?.nextStart ?? null} />
            <section className="card stack-sm" aria-labelledby="runs-title">
              <h2 id="runs-title" className="list-count">
                Tus últimos periodos
              </h2>
              {runs.length === 0 ? (
                <p className="muted small">Aún no hay periodos registrados.</p>
              ) : (
                <ul className="day-items">
                  {runs.slice(0, 6).map((r, i) => {
                    const prev = runs[i + 1];
                    return (
                      <li key={r.start}>
                        <span className="mark" style={{ background: PERIOD_FLOW_INFO.medium.color }} aria-hidden="true" />
                        <span className="day-item__text">
                          <strong>
                            {span(r.start, r.end)}
                          </strong>
                          <span className="muted small">
                            {r.days} {r.days === 1 ? 'día' : 'días'}
                            {prev ? ` · ciclo de ${diffDays(prev.start, r.start)} días` : ''}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function PrivacyCard() {
  const { showCycle, setShowCycle } = useShowCycle();
  return (
    <section className="card privacy-card" aria-label="Privacidad y menú">
      <div className="privacy-card__text">
        <Lock size={18} aria-hidden="true" />
        <p className="small">
          Tus registros de ciclo se guardan en tu cuenta de Design Your Core y se sincronizan con tus dispositivos y con la app anterior. No se comparten con tu pareja vinculada.
        </p>
      </div>
      <div className="setting-row">
        <span className="setting-row__text">
          <span className="field__label" id="cycle-menu">
            Mostrar Ciclo en el menú y en el Calendario
          </span>
          {!showCycle && <span className="field__hint">Ahora está oculto: llegas aquí desde Más.</span>}
        </span>
        <label className="switch">
          <input type="checkbox" role="switch" checked={showCycle} onChange={() => setShowCycle(!showCycle)} aria-labelledby="cycle-menu" />
          <span aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}

function DayPanel({ day, entry, status, onToggle }: { day: string; entry: LegacyPeriodDay | undefined; status: 'predicted' | 'fertile' | null; onToggle: () => void }) {
  const actions = useModule('period');
  const symptoms = splitTags(entry?.symptoms);
  const note = useAutosave(entry?.note ?? '', (v) => entry && v !== entry.note && actions.update(entry.id, { note: v }), 400);
  const toggleSymptom = (s: string) => {
    if (!entry) return;
    const next = symptoms.includes(s) ? symptoms.filter((x) => x !== s) : [...symptoms, s];
    // Mismo formato que la app anterior: etiquetas en español separadas por comas.
    actions.update(entry.id, { symptoms: next.join(', ') });
  };
  return (
    <section className="card stack" aria-labelledby="cycle-day-title">
      <div className="stack-xs">
        <h2 id="cycle-day-title" className="section-title">
          {longDay(day)}
        </h2>
        <p className="muted small">{entry ? 'Día de regla registrado.' : status === 'predicted' ? 'Regla prevista (estimación).' : status === 'fertile' ? 'Ventana fértil estimada.' : 'Sin registro.'}</p>
      </div>
      {entry ? (
        <>
          <div className="field">
            <span className="field__label">Flujo</span>
            <Segmented label="Flujo" options={FLOW_OPTIONS} value={flowOf(entry)} onChange={(flow) => actions.update(entry.id, { flow })} />
          </div>
          <fieldset className="field">
            <legend className="field__label">Síntomas</legend>
            <div className="chips">
              {[...PERIOD_SYMPTOMS, ...symptoms.filter((s) => !(PERIOD_SYMPTOMS as readonly string[]).includes(s))].map((s) => (
                <button key={s} type="button" className="chip-btn" aria-pressed={symptoms.includes(s)} onClick={() => toggleSymptom(s)}>
                  {s}
                </button>
              ))}
            </div>
          </fieldset>
          <MoodPicker legend="Ánimo" moods={PERIOD_MOODS} value={entry.mood ?? ''} onChange={(mood) => actions.update(entry.id, { mood })} />
          <TextArea label="Nota" rows={3} maxLength={2000} value={note.draft} onChange={(e) => note.change(e.target.value)} onBlur={note.flush} placeholder="Cómo te sientes, medicación…" />
          <div>
            <button type="button" className="btn btn--ghost danger-text" onClick={onToggle}>
              Quitar día de regla
            </button>
          </div>
        </>
      ) : (
        <div>
          <button type="button" className="btn" onClick={onToggle}>
            Marcar como día de regla
          </button>
        </div>
      )}
    </section>
  );
}

function CycleSettings({ cycleLength, periodLength, nextStart }: { cycleLength: number; periodLength: number; nextStart: string | null }) {
  const actions = useModuleObject('cycle');
  const reminders = useModule('reminders');
  const toast = useToast();
  const [cycle, setCycle] = useState(String(cycleLength));
  const [length, setLength] = useState(String(periodLength));
  const c = Number(cycle);
  const p = Number(length);
  const cycleOk = Number.isInteger(c) && c >= 15 && c <= 60;
  const lengthOk = Number.isInteger(p) && p >= 1 && p <= 14;
  const changed = c !== cycleLength || p !== periodLength;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!cycleOk || !lengthOk) return;
    actions.patch({ cycleLength: c, periodLength: p });
    toast('Duraciones guardadas.');
  };

  // Como la app anterior: un evento del Calendario el día del mes previsto.
  const remind = () => {
    if (!nextStart) return;
    const day = Number(nextStart.slice(8));
    reminders.add({ id: newId(), day, title: '🩸 Posible inicio del periodo', when: MONTHS[Number(nextStart.slice(5, 7)) - 1], color: '#EC6A9C', icon: 'doc', on: true });
    toast(`Aviso añadido al Calendario el día ${day}. Los eventos se repiten cada mes: bórralo cuando pase.`);
  };

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="cycle-settings-title">
      <h2 id="cycle-settings-title" className="list-count">
        Tu ciclo
      </h2>
      <div className="grid-2">
        <TextField label="Duración del ciclo (días)" type="number" inputMode="numeric" min="15" max="60" step="1" value={cycle} onChange={(e) => setCycle(e.target.value)} error={cycleOk ? null : 'Entre 15 y 60 días.'} />
        <TextField label="Duración de la regla (días)" type="number" inputMode="numeric" min="1" max="14" step="1" value={length} onChange={(e) => setLength(e.target.value)} error={lengthOk ? null : 'Entre 1 y 14 días.'} />
      </div>
      <div className="form-actions form-actions--split">
        <button type="button" className="btn btn--ghost" onClick={remind} disabled={!nextStart}>
          <CalendarPlus size={18} aria-hidden="true" /> Recordarme el próximo periodo
        </button>
        <button type="submit" className="btn btn--secondary" disabled={!cycleOk || !lengthOk || !changed}>
          Guardar
        </button>
      </div>
    </form>
  );
}

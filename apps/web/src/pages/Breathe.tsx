import { isDay, MEDITATION_KIND, periodRange, shortDay, utcDayKey, type LegacyMeditation } from '@dyc/core';
import { Pause, Play, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Segmented } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { Stats } from '../components/ToolParts';

type Phase = 'in' | 'hold' | 'out';
type PatternId = 'caja' | '478';
type Status = 'idle' | 'running' | 'paused';

export const BREATH_PATTERNS: Record<PatternId, { label: string; hint: string; phases: Array<[Phase, number]> }> = {
  caja: { label: 'Caja 4-4-4-4', hint: 'Inhala 4, mantén 4, exhala 4 y mantén 4 segundos. Ayuda a calmarte y concentrarte.', phases: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]] },
  '478': { label: '4-7-8', hint: 'Inhala 4, mantén 7 y exhala 8 segundos. Ayuda a relajarte antes de dormir.', phases: [['in', 4], ['hold', 7], ['out', 8]] },
};
// Orden fijo: «478» parece un número y Object.keys lo pondría primero.
const PATTERN_ORDER: PatternId[] = ['caja', '478'];
const PHASE_LABEL: Record<Phase, string> = { in: 'Inhala', hold: 'Mantén', out: 'Exhala' };
const DURATIONS = [1, 3, 5] as const;
const HISTORY_MAX = 30;

/** Fase de la respiración en un momento de la sesión (en milisegundos desde el inicio). */
export function breathPhase(pattern: PatternId, ms: number): { phase: Phase; index: number; secondsLeft: number; seconds: number } {
  const phases = BREATH_PATTERNS[pattern].phases;
  const cycle = phases.reduce((s, [, n]) => s + n, 0) * 1000;
  let t = ms % cycle;
  for (let i = 0; i < phases.length; i++) {
    const len = phases[i][1] * 1000;
    if (t < len) return { phase: phases[i][0], index: i, seconds: phases[i][1], secondsLeft: Math.ceil((len - t) / 1000) };
    t -= len;
  }
  return { phase: phases[0][0], index: 0, seconds: phases[0][1], secondsLeft: phases[0][1] };
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const spoken = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return [m && `${m} ${m === 1 ? 'minuto' : 'minutos'}`, r && `${r} ${r === 1 ? 'segundo' : 'segundos'}`].filter(Boolean).join(' y ') || '0 segundos';
};

export function Breathe() {
  const legacy = useLegacyData();
  const sessions = useLegacyList(legacy.data?.data, 'meditations');
  const actions = useModule('meditations');
  const toast = useToast();
  const [pattern, setPattern] = useState<PatternId>('caja');
  const [minutes, setMinutes] = useState<(typeof DURATIONS)[number]>(3);
  const [status, setStatus] = useState<Status>('idle');
  const [elapsedBefore, setElapsedBefore] = useState(0);
  const [message, setMessage] = useState('');
  const startedAt = useRef(0);
  const saved = useRef(false);
  const [, setTick] = useState(0);

  const total = minutes * 60_000;
  const elapsed = status === 'running' ? Math.min(total, elapsedBefore + Date.now() - startedAt.current) : elapsedBefore;
  const now = breathPhase(pattern, elapsed);
  const active = status !== 'idle';

  const save = useCallback(
    (mins: number) => {
      if (saved.current || mins < 1) return false;
      saved.current = true;
      // Como la app anterior: día en UTC, minutos enteros y «respiracion».
      actions.add({ id: newId(), date: utcDayKey(), minutes: mins, kind: MEDITATION_KIND });
      return true;
    },
    [actions],
  );

  const finish = useCallback(() => {
    save(minutes);
    setStatus('idle');
    setElapsedBefore(0);
    setMessage(`Sesión terminada: ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} de respiración guardados.`);
    toast(`¡Bien hecho! ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} de respiración.`);
  }, [minutes, save, toast]);

  useEffect(() => {
    if (status !== 'running') return;
    const t = window.setInterval(() => {
      if (elapsedBefore + Date.now() - startedAt.current >= total) finish();
      else setTick((n) => n + 1);
    }, 200);
    return () => window.clearInterval(t);
  }, [status, elapsedBefore, total, finish]);

  // Anuncia solo el cambio de fase (no cada segundo).
  const phases = BREATH_PATTERNS[pattern].phases;
  const cycleMs = phases.reduce((s, [, n]) => s + n, 0) * 1000;
  const phaseKey = status === 'running' ? `${Math.floor(elapsed / cycleMs)}-${now.index}` : '';
  const cue = PHASE_LABEL[now.phase];
  useEffect(() => {
    if (phaseKey) setMessage(cue);
  }, [phaseKey, cue]);

  useEffect(() => () => void (document.title = 'Design Your Core'), []);

  const start = () => {
    if (status === 'idle') {
      saved.current = false;
      setElapsedBefore(0);
    }
    startedAt.current = Date.now();
    setStatus('running');
  };
  const pause = () => {
    setElapsedBefore(elapsed);
    setStatus('paused');
    setMessage('En pausa.');
  };
  const stop = () => {
    const mins = Math.floor(elapsed / 60_000);
    const ok = save(mins);
    setStatus('idle');
    setElapsedBefore(0);
    setMessage(ok ? `Sesión guardada: ${mins} ${mins === 1 ? 'minuto' : 'minutos'}.` : 'Sesión terminada. Con menos de un minuto no se guarda.');
    if (ok) toast(`Sesión guardada: ${mins} ${mins === 1 ? 'minuto' : 'minutos'}.`);
  };

  const today = utcDayKey();
  const week = periodRange('week', today);
  const valid = useMemo(() => sessions.filter((s) => isDay(s.date) && typeof s.minutes === 'number'), [sessions]);
  const todayMinutes = valid.filter((s) => s.date === today).reduce((n, s) => n + s.minutes, 0);
  const weekMinutes = valid.filter((s) => s.date >= week.from && s.date <= week.to).reduce((n, s) => n + s.minutes, 0);

  const remove = (m: LegacyMeditation) => {
    const order = sessions.map((x) => x.id);
    actions.remove(m.id);
    toast('Sesión eliminada.', {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(m);
          actions.reorder(order);
        },
      },
    });
  };

  // El círculo crece al inhalar, se queda al mantener y se encoge al exhalar.
  const prev = phases[(now.index + phases.length - 1) % phases.length][0];
  const scale = active && (now.phase === 'in' || (now.phase === 'hold' && prev === 'in')) ? 1 : 0.62;

  return (
    <div className="page">
      <PageHeader eyebrow="Salud" title="Respiración" />
      <div className="focus-layout">
        <section className="card card--raised breathe" aria-labelledby="breathe-title">
          <h2 id="breathe-title" className="visually-hidden">
            Respiración guiada
          </h2>
          <Segmented label="Técnica" value={pattern} onChange={setPattern} disabled={active} options={PATTERN_ORDER.map((p) => ({ value: p, label: BREATH_PATTERNS[p].label }))} />
          <p className="muted small center">{BREATH_PATTERNS[pattern].hint}</p>
          <div className="breathe__stage">
            <div className="breathe__circle" data-phase={active ? now.phase : 'idle'} style={{ ['--scale' as string]: scale, ['--phase-s' as string]: `${now.seconds}s` }} aria-hidden="true" />
            <div className="breathe__cue">
              <span className="breathe__phase">{active ? PHASE_LABEL[now.phase] : 'Lista'}</span>
              {active && (
                <span className="breathe__count numeric" aria-hidden="true">
                  {now.secondsLeft}
                </span>
              )}
            </div>
          </div>
          <p className="center">
            <span className="numeric" role="timer" aria-label={`Tiempo restante: ${spoken(total - elapsed)}`}>
              {clock(total - elapsed)}
            </span>{' '}
            <span className="muted small">de {minutes} min</span>
          </p>
          <Segmented label="Duración" value={String(minutes)} onChange={(v) => setMinutes(Number(v) as (typeof DURATIONS)[number])} disabled={active} options={DURATIONS.map((d) => ({ value: String(d), label: `${d} min` }))} />
          <div className="timer__controls">
            {status === 'running' ? (
              <button type="button" className="btn timer__main" onClick={pause}>
                <Pause size={18} aria-hidden="true" /> Pausar
              </button>
            ) : (
              <button type="button" className="btn timer__main" onClick={start}>
                <Play size={18} aria-hidden="true" /> {status === 'paused' ? 'Continuar' : 'Empezar'}
              </button>
            )}
            <button type="button" className="btn btn--secondary" onClick={stop} disabled={!active}>
              <Square size={16} aria-hidden="true" /> Terminar
            </button>
          </div>
          <p className="muted small center">Sigue el texto: «Inhala», «Mantén» y «Exhala». Si terminas antes, se guardan los minutos completos.</p>
          <p className="visually-hidden" aria-live="polite">
            {message}
          </p>
        </section>

        <section className="stack" aria-labelledby="breathe-stats-title">
          <h2 id="breathe-stats-title" className="section-title">
            Tus minutos de calma
          </h2>
          {legacy.isPending ? (
            <Loading label="Cargando tus sesiones" />
          ) : legacy.isError ? (
            <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
          ) : (
            <>
              <Stats
                items={[
                  { value: `${weekMinutes} min`, label: 'Esta semana' },
                  { value: `${todayMinutes} min`, label: 'Hoy' },
                  { value: valid.length, label: valid.length === 1 ? 'Sesión en total' : 'Sesiones en total' },
                ]}
              />
              <div className="card card--list">
                <h3 className="list-count">Últimas sesiones</h3>
                {valid.length === 0 ? (
                  <EmptyState title="Aún no hay sesiones">Empieza con 1 minuto: se guarda al terminar.</EmptyState>
                ) : (
                  <ul className="day-items">
                    {valid.slice(0, HISTORY_MAX).map((m) => {
                      const label = `${m.minutes} min del ${shortDay(m.date)}`;
                      return (
                        <li key={m.id}>
                          <span className="mark mark--breathe" aria-hidden="true" />
                          <span className="day-item__text">
                            <strong>{m.minutes} min</strong>
                            <span className="muted small">
                              {m.date === today ? 'Hoy' : shortDay(m.date)} · {m.kind === MEDITATION_KIND || !m.kind ? 'Respiración' : m.kind}
                            </span>
                          </span>
                          <button type="button" className="icon-btn" onClick={() => remove(m)} aria-label={`Borrar la sesión de ${label}`}>
                            <Trash2 size={18} aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

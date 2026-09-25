import { FOCUS_MODE_INFO, FOCUS_MODES, focusStats, nextFocusMode, shortDay, utcDayKey, type FocusMode } from '@dyc/core';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Segmented } from '../components/Form';
import { ErrorState, Loading } from '../components/States';
import { hoursShort } from '../lib/tools';

type Status = 'idle' | 'running' | 'paused';
const MODE_OPTIONS = FOCUS_MODES.map((m) => ({ value: m, label: FOCUS_MODE_INFO[m].label }));
const totalMs = (m: FocusMode) => FOCUS_MODE_INFO[m].minutes * 60_000;

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const spoken = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return [m && `${m} ${m === 1 ? 'minuto' : 'minutos'}`, r && `${r} ${r === 1 ? 'segundo' : 'segundos'}`].filter(Boolean).join(' y ') || '0 segundos';
};

export function Focus() {
  const legacy = useLegacyData();
  const records = useLegacyList(legacy.data?.data, 'focus');
  const actions = useModule('focus');
  const [mode, setMode] = useState<FocusMode>('focus');
  const [status, setStatus] = useState<Status>('idle');
  const [remaining, setRemaining] = useState(totalMs('focus'));
  const [completed, setCompleted] = useState(0);
  const [message, setMessage] = useState('');
  const endsAt = useRef(0);
  const [, setTick] = useState(0);

  const left = status === 'running' ? Math.max(0, endsAt.current - Date.now()) : remaining;
  const total = totalMs(mode);
  const label = FOCUS_MODE_INFO[mode].label;

  const switchTo = (next: FocusMode) => {
    setMode(next);
    setRemaining(totalMs(next));
    setStatus('idle');
  };

  /** Termina la sesión (por tiempo o al saltar): guarda lo transcurrido si pasó al menos 1 s. */
  const finish = useCallback(
    (skipped: boolean) => {
      const rest = status === 'running' ? Math.max(0, endsAt.current - Date.now()) : remaining;
      const seconds = Math.round((total - rest) / 1000);
      endsAt.current = Number.POSITIVE_INFINITY; // evita terminar dos veces
      if (seconds >= 1) actions.add({ id: newId(), mode, seconds, dateKey: utcDayKey() });
      const done = mode === 'focus' && !skipped ? completed + 1 : completed;
      setCompleted(done);
      // Saltar un enfoque lleva a un descanso corto; completarlo cuenta para el largo.
      const next = mode === 'focus' && skipped ? 'short' : nextFocusMode(mode, done);
      switchTo(next);
      setMessage(`${skipped ? 'Sesión saltada' : '¡Sesión terminada!'} Ahora toca: ${FOCUS_MODE_INFO[next].label.toLowerCase()}, ${FOCUS_MODE_INFO[next].minutes} minutos.`);
    },
    [actions, completed, mode, remaining, status, total],
  );

  // Mientras corre: refresca la pantalla y termina al llegar a cero.
  useEffect(() => {
    if (status !== 'running') return;
    const t = window.setInterval(() => {
      if (endsAt.current - Date.now() <= 0) finish(false);
      else setTick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(t);
  }, [status, finish]);

  // El título de la pestaña muestra el tiempo restante mientras corre.
  const shown = clock(left);
  useEffect(() => {
    if (status === 'running') document.title = `${shown} · ${label}`;
  }, [status, shown, label]);
  useEffect(() => {
    if (status !== 'running') document.title = 'Enfoque · Design Your Core';
  }, [status]);
  useEffect(() => () => void (document.title = 'Design Your Core'), []);

  const start = () => {
    endsAt.current = Date.now() + remaining;
    setStatus('running');
    setMessage(`${label} en marcha. Quedan ${spoken(remaining)}.`);
  };
  const pause = () => {
    const rest = Math.max(0, endsAt.current - Date.now());
    setRemaining(rest);
    setStatus('paused');
    setMessage(`En pausa. Quedan ${spoken(rest)}.`);
  };
  const reset = () => {
    setRemaining(total);
    setStatus('idle');
    setMessage('Temporizador reiniciado.');
  };

  const today = utcDayKey();
  const stats = focusStats(records, today);
  const cycle = mode === 'long' && completed > 0 ? 4 : completed % 4;
  const recent = records.slice(0, 5);

  return (
    <div className="page">
      <PageHeader eyebrow="Herramientas" title="Enfoque" />
      <div className="focus-layout">
        <section className="card card--raised timer" aria-labelledby="timer-title">
          <h2 id="timer-title" className="visually-hidden">
            Temporizador
          </h2>
          <Segmented label="Tipo de sesión" options={MODE_OPTIONS} value={mode} onChange={switchTo} disabled={status === 'running'} />
          <div className="timer__dial" data-mode={mode}>
            <svg className="ring timer__ring" viewBox="0 0 36 36" style={{ ['--value' as string]: ((total - left) / total) * 100 }} aria-hidden="true">
              <circle className="ring__track" cx="18" cy="18" r="15.5" />
              <circle className="ring__value" cx="18" cy="18" r="15.5" pathLength={100} />
            </svg>
            <div className="timer__center">
              <span className="timer__time numeric" role="timer" aria-label={`Tiempo restante: ${spoken(left)}`}>
                {shown}
              </span>
              <span className="timer__mode">{status === 'paused' ? `${label} · en pausa` : label}</span>
            </div>
          </div>
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
            <button type="button" className="btn btn--secondary" onClick={reset} disabled={status === 'idle'}>
              <RotateCcw size={18} aria-hidden="true" /> Reiniciar
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => finish(true)}>
              <SkipForward size={18} aria-hidden="true" /> Saltar
            </button>
          </div>
          <div className="cycle" aria-label={`Ciclo: ${cycle} de 4 sesiones de enfoque hasta el descanso largo`} role="img">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`cycle__dot${i < cycle ? ' cycle__dot--on' : ''}`} />
            ))}
          </div>
          <p className="muted small center">Cada cuatro sesiones de enfoque toca un descanso largo. Se guarda cada sesión que termines o saltes.</p>
          <p className="visually-hidden" aria-live="polite">
            {message}
          </p>
        </section>

        <section className="stack" aria-labelledby="focus-stats-title">
          <h2 id="focus-stats-title" className="section-title">
            Tu enfoque
          </h2>
          {legacy.isPending ? (
            <Loading label="Cargando tus sesiones" />
          ) : legacy.isError ? (
            <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
          ) : (
            <>
              <div className="stats stats--2">
                <div className="card stat">
                  <span className="stat__value">{stats.sessionsToday}</span>
                  <span className="stat__label">Sesiones hoy</span>
                </div>
                <div className="card stat">
                  <span className="stat__value">{hoursShort(stats.hoursWeek)}</span>
                  <span className="stat__label">Últimos 7 días</span>
                </div>
                <div className="card stat">
                  <span className="stat__value">{hoursShort(stats.hoursTotal)}</span>
                  <span className="stat__label">En total</span>
                </div>
                <div className="card stat">
                  <span className="stat__value">{stats.streak}</span>
                  <span className="stat__label">{stats.streak === 1 ? 'Día seguido' : 'Días seguidos'}</span>
                </div>
              </div>
              <div className="card card--list">
                <h3 className="list-count">Últimas sesiones</h3>
                {recent.length === 0 ? (
                  <p className="muted small recent-empty">Aún no hay sesiones. Empieza una de 25 minutos.</p>
                ) : (
                  <ul className="legacy-list">
                    {recent.map((r) => (
                      <li key={r.id}>
                        <span>{FOCUS_MODE_INFO[r.mode]?.label ?? r.mode}</span>
                        <span className="muted small numeric">
                          {Math.max(1, Math.round(r.seconds / 60))} min · {r.dateKey === today ? 'hoy' : shortDay(r.dateKey)}
                        </span>
                      </li>
                    ))}
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

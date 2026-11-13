import { FOCUS_MODE_INFO, FOCUS_MODES, focusClock, focusSpoken, focusStats, hoursShort, shortDay, utcDayKey, type FocusMode } from '@dyc/core';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { focusLeft, getFocusTimer, setFocusTimer, useFocusTimer } from '../app/focusTimer';
import { useLegacyData, useLegacyList } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Segmented } from '../components/Form';
import { useFocusFinish } from '../components/FocusWatcher';
import { ErrorState, Loading } from '../components/States';

const MODE_OPTIONS = FOCUS_MODES.map((m) => ({ value: m, label: FOCUS_MODE_INFO[m].label }));
const totalMs = (m: FocusMode) => FOCUS_MODE_INFO[m].minutes * 60_000;

const clock = focusClock;
const spoken = focusSpoken;

export function Focus() {
  const legacy = useLegacyData();
  const records = useLegacyList(legacy.data?.data, 'focus');
  // El temporizador vive fuera de la página: sigue al cambiar de sección o recargar.
  const timer = useFocusTimer();
  const finishSession = useFocusFinish();
  const { mode, status, completed } = timer;
  const [message, setMessage] = useState('');
  const [, setTick] = useState(0);

  const left = focusLeft(timer);
  const total = totalMs(mode);
  const label = FOCUS_MODE_INFO[mode].label;

  const switchTo = (next: FocusMode) => setFocusTimer((t) => ({ ...t, mode: next, status: 'idle', endsAt: 0, remaining: totalMs(next) }));

  const finish = (skipped: boolean) => {
    const { next } = finishSession(skipped);
    setMessage(`${skipped ? 'Sesión saltada' : '¡Sesión terminada!'} Ahora toca: ${FOCUS_MODE_INFO[next].label.toLowerCase()}, ${FOCUS_MODE_INFO[next].minutes} minutos.`);
  };

  // Mientras corre: refresca la pantalla (la sesión la termina FocusWatcher).
  useEffect(() => {
    if (status !== 'running') return;
    const t = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [status]);

  const shown = clock(left);

  const start = () => {
    setFocusTimer((t) => ({ ...t, status: 'running', endsAt: Date.now() + t.remaining }));
    setMessage(`${label} en marcha. Quedan ${spoken(timer.remaining)}.`);
  };
  const pause = () => {
    const rest = focusLeft(getFocusTimer());
    setFocusTimer((t) => ({ ...t, status: 'paused', endsAt: 0, remaining: rest }));
    setMessage(`En pausa. Quedan ${spoken(rest)}.`);
  };
  const reset = () => {
    setFocusTimer((t) => ({ ...t, status: 'idle', endsAt: 0, remaining: total }));
    setMessage('Temporizador reiniciado.');
  };

  const today = utcDayKey();
  const stats = focusStats(records, today);
  const cycle = mode === 'long' && completed > 0 ? 4 : completed % 4;
  const recent = records.slice(0, 5);

  return (
    <div className="page">
      <PageHeader eyebrow="Organización" title="Pomodoro" />
      <div className="focus-layout">
        <section className="card card--raised timer" aria-labelledby="timer-title">
          <h2 id="timer-title" className="visually-hidden">
            Temporizador
          </h2>
          <Segmented label="Tipo de sesión" options={MODE_OPTIONS} value={mode} onChange={switchTo} disabled={status === 'running'} />
          {status === 'running' && <p className="small muted">Pausa para cambiar de modo.</p>}
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
          <p className="muted small center">Cada cuatro sesiones de enfoque toca un descanso largo. Sigue contando aunque vayas a otra sección, y se guarda cada sesión que termines o saltes.</p>
          <p className="visually-hidden" aria-live="polite">
            {message}
          </p>
        </section>

        <section className="stack" aria-labelledby="focus-stats-title">
          <h2 id="focus-stats-title" className="section-title">
            Tus sesiones
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

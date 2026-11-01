import { FOCUS_MODE_INFO, focusClock, nextFocusMode, utcDayKey, type FocusMode } from '@dyc/core';
import { Timer } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { focusLeft, focusTotalMs, getFocusTimer, setFocusTimer, useFocusTimer } from '../app/focusTimer';
import { newId, useModule } from '../app/legacy';
import { useToast } from '../app/toast';

/**
 * Termina la sesión en curso (por tiempo o al saltarla): guarda lo
 * transcurrido si pasó al menos 1 s y pasa al siguiente tipo de sesión.
 */
export function useFocusFinish() {
  const actions = useModule('focus');
  return useCallback(
    (skipped: boolean): { mode: FocusMode; next: FocusMode } => {
      const t = getFocusTimer();
      const ended = t.status === 'running' ? Math.min(Date.now(), t.endsAt) : Date.now();
      const seconds = Math.round((focusTotalMs(t.mode) - focusLeft(t, ended)) / 1000);
      const done = t.mode === 'focus' && !skipped ? t.completed + 1 : t.completed;
      // Saltar un enfoque lleva a un descanso corto; completarlo cuenta para el largo.
      const next = t.mode === 'focus' && skipped ? 'short' : nextFocusMode(t.mode, done);
      // Primero el nuevo estado: así no se guarda dos veces.
      setFocusTimer({ mode: next, status: 'idle', endsAt: 0, remaining: focusTotalMs(next), completed: done, day: utcDayKey() });
      if (seconds >= 1) actions.add({ id: newId(), mode: t.mode, seconds, dateKey: utcDayKey(new Date(ended)) });
      return { mode: t.mode, next };
    },
    [actions],
  );
}

/**
 * Siempre montado en la app: el temporizador sigue aunque cambies de
 * sección, termina la sesión al llegar a cero (aunque hayas recargado) y
 * muestra el tiempo en el título de la pestaña.
 */
export function FocusWatcher() {
  const timer = useFocusTimer();
  const finish = useFocusFinish();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const onFocusPage = location.pathname === '/enfoque';
  const here = useRef(onFocusPage);
  here.current = onFocusPage;
  const base = useRef('');
  const running = timer.status === 'running';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const t = getFocusTimer();
      if (t.status !== 'running') return;
      const left = focusLeft(t);
      if (left <= 0) {
        const { mode, next } = finish(false);
        const msg = `${FOCUS_MODE_INFO[mode].label}: ¡sesión terminada! Ahora toca ${FOCUS_MODE_INFO[next].label.toLowerCase()}, ${FOCUS_MODE_INFO[next].minutes} minutos.`;
        toast(msg, here.current ? undefined : { action: { label: 'Ir a Enfoque', run: () => navigate('/enfoque') } });
        return;
      }
      // El título de la página se guarda para devolverlo al parar.
      if (!TIMER_TITLE.test(document.title)) base.current = document.title;
      document.title = `${focusClock(left)} · ${FOCUS_MODE_INFO[t.mode].label}`;
      setNow(Date.now());
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [running, finish, toast, navigate]);

  // Al parar, la pestaña vuelve a su título.
  useEffect(() => {
    if (!running && TIMER_TITLE.test(document.title)) document.title = base.current || 'Design Your Core';
  }, [running]);

  // Fuera de Enfoque, el tiempo a la vista y un enlace para volver.
  if (!running || onFocusPage) return null;
  const clock = focusClock(focusLeft(timer, now));
  return (
    <Link to="/enfoque" className="focus-chip" aria-label={`${FOCUS_MODE_INFO[timer.mode].label} en marcha: quedan ${clock}. Ir a Enfoque`}>
      <Timer size={16} aria-hidden="true" />
      <span className="numeric">{clock}</span>
    </Link>
  );
}

const TIMER_TITLE = /^\d+:\d\d · /;

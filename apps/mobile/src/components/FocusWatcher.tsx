import { FOCUS_MODE_INFO } from '@dyc/core';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { focusLeft, getFocusTimer, useFocusFinish, useFocusTimer } from '../lib/focusTimer';
import { useToast } from '../lib/toast';

/**
 * Siempre montado con la sesión abierta: termina la sesión de Enfoque al
 * llegar a cero aunque estés en otra pantalla o vuelvas a la app más tarde.
 */
export function FocusWatcher() {
  const running = useFocusTimer().status === 'running';
  const finish = useFocusFinish();
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();
  const here = useRef(path);
  here.current = path;

  useEffect(() => {
    if (!running) return;
    const check = () => {
      const t = getFocusTimer();
      if (t.status !== 'running' || focusLeft(t) > 0) return;
      const { mode, next } = finish(false);
      const msg = `${FOCUS_MODE_INFO[mode].label}: ¡sesión terminada! Ahora toca ${FOCUS_MODE_INFO[next].label.toLowerCase()}, ${FOCUS_MODE_INFO[next].minutes} minutos.`;
      toast(msg, here.current === '/enfoque' ? undefined : { action: { label: 'Ir a Pomodoro', run: () => router.push('/enfoque') } });
    };
    check();
    const id = setInterval(check, 500);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [running, finish, toast, router]);
  return null;
}

import type { AlarmAt } from '@dyc/core';
import { BellRing } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useLegacyData } from '../app/legacy';
import { useToast } from '../app/toast';
import { onAlarmPrefs, playAlarm, pushSupported, readAlarmPrefs, syncServerAlarms, unlockAudio, upcomingAlarms } from '../lib/alarms';

/** Una alarma que el panel encontró con más retraso que esto ya no suena (estuvo cerrado o dormido). */
const LATE_MS = 2 * 60_000;

/**
 * Siempre montado con la sesión abierta: hace sonar las alarmas de las
 * clases, recordatorios y tareas a su hora y mantiene al día las que el
 * servidor envía cuando el panel está cerrado.
 */
export function AlarmWatcher() {
  const legacy = useLegacyData();
  const [prefs, setPrefs] = useState(readAlarmPrefs);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  const [ringing, setRinging] = useState<Pick<AlarmAt, 'id' | 'title' | 'body' | 'url'> | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const rung = useRef(new Set<string>());
  const data = legacy.data?.data;
  const toast = useToast();

  useEffect(() => onAlarmPrefs(setPrefs), []);

  // Con permiso y suscripción, el servidor avisa con el panel cerrado.
  useEffect(() => {
    if (!pushSupported() || Notification.permission !== 'granted') return setPushOn(false);
    let alive = true;
    void navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (alive) setPushOn(!!sub);
    });
    return () => {
      alive = false;
    };
  }, [prefs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `minute` hace que la lista avance con el tiempo.
  const alarms = useMemo(() => (legacy.data ? upcomingAlarms(data, prefs) : []), [data, prefs, minute, legacy.data]);
  const latest = useRef(alarms);
  latest.current = alarms;

  // Al servidor van las de los próximos días (sin nada si están apagadas).
  useEffect(() => {
    if (!pushOn || !legacy.data) return;
    const t = window.setTimeout(() => void syncServerAlarms(prefs.enabled ? alarms : []).catch(() => undefined), 2000);
    return () => window.clearTimeout(t);
  }, [alarms, pushOn, prefs.enabled, legacy.data]);

  const ring = useCallback(
    (a: Pick<AlarmAt, 'id' | 'title' | 'body' | 'url'>) => {
      if (rung.current.has(a.id)) return;
      rung.current.add(a.id);
      // Comidas, agua y mensajes positivos: un aviso suave, sin alarma larga.
      const gentle = /^(meal|water|cheer)-/.test(a.id);
      if (gentle && document.visibilityState === 'visible') {
        stop.current?.();
        stop.current = playAlarm(2);
        toast(`${a.title}. ${a.body}`, { key: 'cuidarte' });
        return;
      }
      if (document.visibilityState === 'visible') {
        stop.current?.();
        stop.current = playAlarm(60);
        setRinging(a);
        return;
      }
      // Pestaña en segundo plano: si el servidor no avisa, avisa el propio panel.
      if (pushOn || !('Notification' in window) || Notification.permission !== 'granted') return;
      stop.current?.();
      stop.current = playAlarm(15);
      const opts: NotificationOptions = { body: a.body, tag: a.id, requireInteraction: true, icon: '/icon-192.png', data: { url: a.url } };
      void (navigator.serviceWorker?.getRegistration() ?? Promise.resolve(undefined))
        .then((reg) => {
          if (reg) return reg.showNotification(a.title, opts);
          new Notification(a.title, opts);
        })
        .catch(() => undefined);
    },
    [pushOn, toast],
  );

  // Cada 10 s: ¿llegó la hora de alguna?
  useEffect(() => {
    if (!prefs.enabled) return;
    let last = Date.now();
    const check = () => {
      const now = Date.now();
      for (const a of latest.current) {
        const t = Date.parse(a.at);
        if (t <= now && t > last - 1000 && now - t < LATE_MS) ring(a);
      }
      last = now;
      const m = Math.floor(now / 60_000);
      setMinute((x) => (x === m ? x : m));
    };
    const id = window.setInterval(check, 10_000);
    return () => window.clearInterval(id);
  }, [prefs.enabled, ring]);

  // El servicio de avisos manda las del servidor aquí cuando el panel está a la vista.
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const h = (e: MessageEvent) => {
      const d = e.data as { type?: string; id?: string; title?: string; body?: string; url?: string } | null;
      if (d?.type === 'dyc-alarm' && d.id && d.title) ring({ id: d.id, title: d.title, body: d.body ?? '', url: d.url ?? '/' });
    };
    sw.addEventListener('message', h);
    return () => sw.removeEventListener('message', h);
  }, [ring]);

  // El navegador solo deja sonar después de un toque en la página.
  useEffect(() => {
    if (!prefs.enabled) return;
    const h = () => unlockAudio();
    window.addEventListener('pointerdown', h, { once: true });
    window.addEventListener('keydown', h, { once: true });
    return () => {
      window.removeEventListener('pointerdown', h);
      window.removeEventListener('keydown', h);
    };
  }, [prefs.enabled]);

  const dismiss = () => {
    stop.current?.();
    stop.current = null;
    setRinging(null);
  };

  if (!ringing) return null;
  return (
    <div className="alarm" role="alertdialog" aria-labelledby="alarm-title" aria-describedby="alarm-body">
      <BellRing className="alarm__icon" size={28} aria-hidden="true" />
      <div className="alarm__text">
        <p className="eyebrow">Alarma</p>
        <h2 id="alarm-title" className="alarm__title">
          {ringing.title}
        </h2>
        <p id="alarm-body" className="muted small">
          {ringing.body}
        </p>
      </div>
      <div className="alarm__actions">
        <button type="button" className="btn" onClick={dismiss} autoFocus>
          Detener
        </button>
        <Link className="btn btn--secondary" to={ringing.url} onClick={dismiss}>
          Ver
        </Link>
      </div>
    </div>
  );
}

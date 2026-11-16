import { DEFAULT_NOTIFY, expandNotificationPlan, notificationPlan, parseNotifyPrefs, type AlarmAt, type LegacyData, type NotifyPrefs } from '@dyc/core';
import { api } from '../app/api';

/**
 * Alarmas del panel web: clases y cursos del Horario, recordatorios del
 * Calendario y tareas de la Agenda con aviso. Con el panel abierto suenan
 * aquí; con el panel cerrado las envía el servidor (Web Push) y el
 * navegador las muestra con su sonido.
 */
const PREFS_KEY = 'dyc-alarmas';
const EVENT = 'dyc-alarmas';

export function readAlarmPrefs(): NotifyPrefs {
  try {
    return parseNotifyPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null'));
  } catch {
    return DEFAULT_NOTIFY;
  }
}

export function saveAlarmPrefs(p: NotifyPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Sin almacenamiento: vale para esta visita.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: p }));
}

export function onAlarmPrefs(fn: (p: NotifyPrefs) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<NotifyPrefs>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** Las alarmas de los próximos días con los datos y las preferencias de ahora. */
export const upcomingAlarms = (data: LegacyData | undefined, prefs: NotifyPrefs, now = new Date()): AlarmAt[] => expandNotificationPlan(notificationPlan(data, prefs, now), now);

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Pide permiso y suscribe este navegador para recibir las alarmas con el
 * panel cerrado. Devuelve «on», «denied» (no dio permiso) o «unsupported».
 */
export async function enablePush(): Promise<'on' | 'denied' | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  if (!pushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.push.key();
  const current = await reg.pushManager.getSubscription();
  const sub = current ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.push.subscribe({ endpoint: json.endpoint, keys: json.keys });
  return 'on';
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.push.unsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

let lastSent = '';
/** Sube al servidor las alarmas de los próximos días (solo si cambiaron). */
export async function syncServerAlarms(alarms: AlarmAt[]) {
  const sig = JSON.stringify(alarms);
  if (sig === lastSent) return;
  await api.push.alarms(alarms);
  lastSent = sig;
}

// ---------- Sonido ----------

let ctx: AudioContext | null = null;

/**
 * Suena como una alarma: pitidos dobles que se repiten hasta `stop()` o
 * hasta `seconds`. Devuelve la función para pararla.
 */
export function playAlarm(seconds = 30): () => void {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return () => undefined;
  try {
    ctx ??= new AC();
    void ctx.resume();
  } catch {
    return () => undefined;
  }
  const audio = ctx;
  const out = audio.createGain();
  out.gain.value = 0.25;
  out.connect(audio.destination);
  const start = audio.currentTime + 0.05;
  // Cada ciclo (1,2 s): dos pitidos agudos y un silencio.
  for (let t = 0; t < seconds; t += 1.2) {
    for (const [off, freq] of [
      [0, 880],
      [0.3, 1175],
    ] as const) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, start + t + off);
      g.gain.linearRampToValueAtTime(1, start + t + off + 0.02);
      g.gain.setValueAtTime(1, start + t + off + 0.2);
      g.gain.linearRampToValueAtTime(0, start + t + off + 0.24);
      o.connect(g).connect(out);
      o.start(start + t + off);
      o.stop(start + t + off + 0.26);
    }
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    out.gain.cancelScheduledValues(audio.currentTime);
    out.gain.setValueAtTime(0, audio.currentTime);
    out.disconnect();
  };
}

/** El navegador suele pedir un toque antes de dejar sonar: con esto el sonido queda listo. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    void ctx.resume();
  } catch {
    // Sin audio: las alarmas se ven igual.
  }
}

import { DEFAULT_NOTIFY, notificationPlan, parseNotifyPrefs, type LegacyData, type NotifyPrefs, type PlannedNotification } from '@dyc/core';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { readJson, storage, writeJson } from './storage';

/**
 * Recordatorio diario del check-in (notificación local, funciona sin
 * servidor) y registro del dispositivo para avisos push futuros.
 */

export interface ReminderPrefs {
  enabled: boolean;
  /** Hora local "HH:MM". */
  time: string;
}

export const DEFAULT_REMINDER: ReminderPrefs = { enabled: false, time: '21:00' };
export const REMINDER_TIMES = ['08:00', '13:00', '19:00', '21:00', '22:00'];

const PREFS_KEY = 'dyc.reminder';
const PUSH_KEY = 'dyc.pushToken';
const REMINDER_ID = 'dyc-checkin';
const CHANNEL = 'recordatorios';

/** Las notificaciones no existen en la vista web. */
export const notificationsSupported = Platform.OS !== 'web';

export function parseTime(time: string): { hour: number; minute: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

export const readReminder = () => readJson<ReminderPrefs>(PREFS_KEY, DEFAULT_REMINDER);

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    // Las alarmas de la Agenda, el Calendario y el Horario suenan también con la app abierta.
    handleNotification: async (n) => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: !!(n.request.content.data as { alarm?: boolean } | undefined)?.alarm, shouldSetBadge: false }),
  });
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Guarda la preferencia y programa (o quita) el recordatorio. Devuelve
 * "denied" si la persona no dio permiso de notificaciones.
 */
export async function setReminder(prefs: ReminderPrefs): Promise<'scheduled' | 'off' | 'denied'> {
  if (!notificationsSupported) return 'off';
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  const time = parseTime(prefs.time);
  if (!prefs.enabled || !time) {
    await writeJson(PREFS_KEY, { ...prefs, enabled: false });
    await unregisterPushDevice();
    return 'off';
  }
  if (!(await ensurePermission())) {
    await writeJson(PREFS_KEY, { ...prefs, enabled: false });
    await unregisterPushDevice();
    return 'denied';
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Recordatorios', importance: Notifications.AndroidImportance.DEFAULT });
  }
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { title: '¿Cómo estuvo tu día?', body: 'Tu check-in toma menos de un minuto.', data: { url: '/check-in' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, ...time, channelId: CHANNEL },
  });
  await writeJson(PREFS_KEY, prefs);
  registerPushDevice().catch(() => undefined);
  return 'scheduled';
}

/**
 * Registra el token push en la API. Necesita un proyecto de EAS
 * (`extra.eas.projectId`); sin él se omite en silencio.
 */
export async function registerPushDevice(): Promise<void> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!notificationsSupported || !Device.isDevice || !projectId) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.devices.register(token, Platform.OS === 'ios' ? 'ios' : 'android');
  await storage.set(PUSH_KEY, token);
}

/** Quita el token push de la API: sin recordatorio, el servidor no guarda nada del teléfono. */
async function unregisterPushDevice(): Promise<void> {
  const token = await storage.get(PUSH_KEY).catch(() => null);
  if (!token) return;
  await api.devices.remove(token).catch(() => undefined);
  await storage.set(PUSH_KEY, null);
}

/** Al cerrar sesión: el dispositivo deja de recibir avisos de esta cuenta. */
export async function forgetDevice(): Promise<void> {
  if (!notificationsSupported) return;
  await unregisterPushDevice();
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  await writeJson(PREFS_KEY, DEFAULT_REMINDER);
  await clearToolNotifications();
  await writeJson(NOTIFY_KEY, DEFAULT_NOTIFY);
  lastSignature = '';
  emitNotify(DEFAULT_NOTIFY);
}

// ---------- Avisos de las herramientas (Horario, Cursos, Calendario, Agenda) ----------

const NOTIFY_KEY = 'dyc.notify';
const TOOL_PREFIX = 'dyc-tool-';
// Canal nuevo con sonido y vibración de alarma (Android no deja cambiar el sonido de un canal ya creado).
const TOOL_CHANNEL = 'alarmas';

export const readNotify = async (): Promise<NotifyPrefs> => parseNotifyPrefs(await readJson<unknown>(NOTIFY_KEY, DEFAULT_NOTIFY));

type Listener = (p: NotifyPrefs) => void;
const listeners = new Set<Listener>();
const emitNotify = (p: NotifyPrefs) => listeners.forEach((l) => l(p));
/** Avisa cuando cambian las preferencias (para volver a programar). */
export function onNotifyChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Guarda las preferencias. Al encender pide permiso; devuelve "denied" si la
 * persona no lo da (y lo deja apagado).
 */
export async function setToolNotifications(prefs: NotifyPrefs): Promise<'on' | 'off' | 'denied'> {
  if (!notificationsSupported) return 'off';
  let next = prefs;
  let result: 'on' | 'off' | 'denied' = prefs.enabled ? 'on' : 'off';
  if (prefs.enabled && !(await ensurePermission())) {
    next = { ...prefs, enabled: false };
    result = 'denied';
  }
  await writeJson(NOTIFY_KEY, next);
  if (!next.enabled) await clearToolNotifications();
  lastSignature = '';
  emitNotify(next);
  return result;
}

async function clearToolNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(all.filter((n) => n.identifier.startsWith(TOOL_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined)));
}

function triggerOf(p: PlannedNotification): Notifications.NotificationTriggerInput {
  const t = p.trigger;
  const channelId = TOOL_CHANNEL;
  if (t.kind === 'weekly') return { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: (t.weekday % 7) + 1, hour: t.hour, minute: t.minute, channelId };
  if (t.kind === 'monthly') return { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, day: t.day, hour: t.hour, minute: t.minute, channelId };
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(t.at), channelId };
}

let lastSignature = '';

/**
 * Vuelve a programar los avisos con los datos actuales: quita los anteriores
 * y programa el plan. Si nada cambió desde la última vez, no hace nada.
 * Devuelve cuántos quedaron programados.
 */
export async function syncToolNotifications(data: LegacyData | null | undefined, prefs: NotifyPrefs, now = new Date()): Promise<number> {
  if (!notificationsSupported) return 0;
  const plan = notificationPlan(data, prefs, now);
  const signature = JSON.stringify(plan);
  if (signature === lastSignature) return plan.length;
  lastSignature = signature;
  await clearToolNotifications();
  if (!plan.length) return 0;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return 0;
  if (Platform.OS === 'android') {
    await Notifications.deleteNotificationChannelAsync('avisos').catch(() => undefined);
    await Notifications.setNotificationChannelAsync(TOOL_CHANNEL, {
      name: 'Alarmas de clases, tareas y recordatorios',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 600, 300, 600, 300, 600],
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: TOOL_PREFIX + p.id,
      content: { title: p.title, body: p.body, data: { url: p.url, alarm: true }, sound: 'default', priority: Notifications.AndroidNotificationPriority.MAX, interruptionLevel: 'timeSensitive' },
      trigger: triggerOf(p),
    }).catch(() => undefined);
  }
  return plan.length;
}

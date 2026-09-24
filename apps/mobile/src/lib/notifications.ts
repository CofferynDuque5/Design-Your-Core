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
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
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
    return 'off';
  }
  if (!(await ensurePermission())) {
    await writeJson(PREFS_KEY, { ...prefs, enabled: false });
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

/** Al cerrar sesión: el dispositivo deja de recibir avisos de esta cuenta. */
export async function forgetDevice(): Promise<void> {
  if (!notificationsSupported) return;
  const token = await storage.get(PUSH_KEY).catch(() => null);
  if (token) await api.devices.remove(token).catch(() => undefined);
  await storage.set(PUSH_KEY, null);
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  await writeJson(PREFS_KEY, DEFAULT_REMINDER);
}

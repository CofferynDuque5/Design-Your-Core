import type { NotifyPrefs } from '@dyc/core';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useLegacyData } from '../lib/legacy';
import { onNotifyChange, readNotify, syncToolNotifications } from '../lib/notifications';

/**
 * Mantiene programados en el teléfono los avisos de clases, cursos,
 * recordatorios y tareas: al abrir la app, al volver a ella y cada vez que
 * cambian tus datos. Así suenan aunque la app esté cerrada.
 */
export function ToolNotificationSync() {
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    readNotify().then(setPrefs);
    const off = onNotifyChange(setPrefs);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setTick((t) => t + 1));
    return () => {
      off();
      sub.remove();
    };
  }, []);
  const enabled = !!prefs?.enabled;
  const legacy = useLegacyData();
  const data = enabled ? legacy.data?.data : undefined;
  useEffect(() => {
    if (!prefs || (prefs.enabled && !data)) return;
    const t = setTimeout(() => void syncToolNotifications(data, prefs).catch(() => undefined), 800);
    return () => clearTimeout(t);
  }, [data, prefs, tick]);
  return null;
}

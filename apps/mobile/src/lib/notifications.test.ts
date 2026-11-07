import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { fakeFetch } from '../test/fakeApi';
import { parseTime, setReminder, setToolNotifications, syncToolNotifications } from './notifications';

// expo-notifications está simulado en src/test/setup.ts.

const N = jest.mocked(Notifications);

describe('recordatorio diario', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lee horas válidas', () => {
    expect(parseTime('21:30')).toEqual({ hour: 21, minute: 30 });
    expect(parseTime('7:30')).toBeNull();
    expect(parseTime('24:00')).toBeNull();
  });

  it('programa un aviso diario a la hora elegida', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
    await expect(setReminder({ enabled: true, time: '20:15' })).resolves.toBe('scheduled');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('dyc-checkin');
    expect(N.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'dyc-checkin', trigger: expect.objectContaining({ type: 'daily', hour: 20, minute: 15 }) }),
    );
  });

  it('sin permiso no programa nada', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    N.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    await expect(setReminder({ enabled: true, time: '20:15' })).resolves.toBe('denied');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('al desactivarlo quita el aviso', async () => {
    await expect(setReminder({ enabled: false, time: '20:15' })).resolves.toBe('off');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('dyc-checkin');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('al desactivarlo también borra el teléfono de la API', async () => {
    await SecureStore.setItemAsync('dyc.pushToken', 'ExponentPushToken[abc]');
    const api = fakeFetch({ 'DELETE /api/v2/devices/:token': () => ({ ok: true }) });
    await setReminder({ enabled: false, time: '20:15' });
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /api/v2/devices/ExponentPushToken%5Babc%5D']);
    expect(await SecureStore.getItemAsync('dyc.pushToken')).toBeNull();
  });
});

describe('avisos de las herramientas', () => {
  beforeEach(() => jest.clearAllMocks());
  const data = {
    classes: [
      { id: 'k1', day: 1, start: '08:00', end: '09:00', title: 'Física', room: 'B-3', color: '#4F7CFF', subject: '' },
      { id: 'k2', day: 7, start: '18:00', end: '19:00', title: 'Inglés', room: '', color: '#4F7CFF', subject: '', course: 'c1' },
    ],
    courses: [{ id: 'c1', topic: 'Inglés', title: 'Inglés básico', url: '', status: 'curso', notes: '' }],
    reminders: [{ id: 'r1', day: 14, title: 'Dentista', when: '14:00', color: '#4F7CFF', icon: 'doc', on: true }],
  } as never;

  it('al encenderlos pide permiso y programa clases, cursos y recordatorios aunque la app se cierre', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
    const prefs = { enabled: true, classes: true, classLead: 10, reminders: true, tasks: true, routines: true };
    await expect(setToolNotifications(prefs)).resolves.toBe('on');
    await expect(syncToolNotifications(data, prefs)).resolves.toBe(3);
    const calls = N.scheduleNotificationAsync.mock.calls.map(([c]) => c as unknown as { identifier: string; trigger: Record<string, unknown>; content: { title: string; data: { url: string } } });
    // Lunes 7:50 → en Expo el lunes es 2; domingo 17:50 → 1.
    expect(calls[0]).toMatchObject({ identifier: 'dyc-tool-class-k1', trigger: { type: 'weekly', weekday: 2, hour: 7, minute: 50, channelId: 'alarmas' }, content: { title: 'Física en 10 min' } });
    expect(calls[1]).toMatchObject({ trigger: { weekday: 1, hour: 17, minute: 50 }, content: { title: 'Curso en 10 min: Inglés básico', data: { url: '/cursos?abrir=c1' } } });
    expect(calls[2]).toMatchObject({ identifier: 'dyc-tool-rem-r1', trigger: { type: 'monthly', day: 14, hour: 14, minute: 0 } });

    // Sin cambios no vuelve a programar; al apagarlos se quitan.
    N.scheduleNotificationAsync.mockClear();
    await syncToolNotifications(data, prefs);
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    N.getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: 'dyc-tool-class-k1' }, { identifier: 'dyc-checkin' }] as never);
    await expect(setToolNotifications({ ...prefs, enabled: false })).resolves.toBe('off');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('dyc-tool-class-k1');
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('dyc-checkin');
  });

  it('sin permiso se queda apagado', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    await expect(setToolNotifications({ enabled: true, classes: true, classLead: 10, reminders: true, tasks: true, routines: true })).resolves.toBe('denied');
    expect(JSON.parse((await SecureStore.getItemAsync('dyc.notify'))!)).toMatchObject({ enabled: false });
  });
});

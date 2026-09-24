import * as Notifications from 'expo-notifications';
import { parseTime, setReminder } from './notifications';

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
});

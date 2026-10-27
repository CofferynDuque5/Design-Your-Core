// Entorno de pruebas: sin fuentes reales ni llavero del sistema.
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), useFonts: () => [true, null], loadAsync: jest.fn() }));

jest.mock('expo-secure-store', () => {
  const data = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => data.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void data.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void data.delete(k)),
    canUseBiometricAuthentication: jest.fn(() => true),
    __reset: () => data.clear(),
  };
});

// Bytes aleatorios del sistema con los de Node (el módulo nativo no existe en Jest).
jest.mock('expo-crypto', () => {
  const { randomBytes, webcrypto } = jest.requireActual<{ randomBytes: (n: number) => Uint8Array; webcrypto: Crypto }>('node:crypto');
  return {
    getRandomBytes: (n: number) => new Uint8Array(randomBytes(n)),
    getRandomValues: <T extends ArrayBufferView>(a: T) => webcrypto.getRandomValues(a as never) as T,
  };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  useLastNotificationResponse: () => null,
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

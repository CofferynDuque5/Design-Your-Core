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
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', DATE: 'date' },
}));

// Galería, archivos y compartir: en Jest no hay módulos nativos; cada prueba decide qué se elige.
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({ resize: jest.fn(), renderAsync: async () => ({ saveAsync: async () => ({ base64: '/9j/AAAA', uri: 'file://x.jpg', width: 10, height: 10 }) }) }),
  },
}));
jest.mock('expo-file-system', () => {
  class File {
    static contents = new Map<string, string>();
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    async text() {
      return File.contents.get(this.uri) ?? '';
    }
    async base64() {
      const { Buffer: B } = jest.requireActual<{ Buffer: { from: (s: string) => { toString: (e: string) => string } } }>('node:buffer');
      return B.from(File.contents.get(this.uri) ?? '').toString('base64');
    }
    write(content: string) {
      File.contents.set(this.uri, content);
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
// Sin motor web en Jest: el WebView es una vista; las pruebas mandan mensajes con `__send`.
jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const state: { props: { onMessage?: (e: { nativeEvent: { data: string } }) => void } | null; injected: string[] } = { props: null, injected: [] };
  const WebView = React.forwardRef((props: Record<string, unknown>, ref) => {
    state.props = props;
    React.useImperativeHandle(ref, () => ({ injectJavaScript: (js: string) => state.injected.push(js) }));
    return React.createElement(View, { testID: 'webview' });
  });
  return { WebView, __state: state, __send: (o: unknown) => state.props?.onMessage?.({ nativeEvent: { data: JSON.stringify(o) } }) };
});

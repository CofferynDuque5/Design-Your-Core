import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Almacén de claves pequeñas. En iOS y Android usa el llavero del sistema
 * (expo-secure-store), así los tokens de sesión no quedan en texto plano.
 * En la vista web (solo para desarrollo y capturas) cae a localStorage.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null): Promise<void>;
}

const web: KeyValueStore = {
  async get(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      // Almacenamiento bloqueado: la sesión dura lo que la pestaña.
    }
  },
};

const secure: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => (value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value)),
};

export const storage: KeyValueStore = Platform.OS === 'web' ? web : secure;

/** Preferencias guardadas como JSON (tema, recordatorio). */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await storage.get(key).catch(() => null);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export const writeJson = (key: string, value: unknown) => storage.set(key, JSON.stringify(value));

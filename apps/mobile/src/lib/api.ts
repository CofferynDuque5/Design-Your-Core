import { createClient } from '@dyc/api-client';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { createAuthStore } from './auth';
import { storage } from './storage';

/** API pública. En desarrollo, la del ordenador que sirve Expo (puerto 4600). */
export function apiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) return `http://${host}:4600`;
  return 'https://designyourcorebackend.nvcorx.com';
}

// La renovación usa su propio cliente sin token para no entrar en bucle.
const bare = createClient({ baseUrl: apiUrl(), getToken: () => null });
export const auth = createAuthStore(storage, (refreshToken) => bare.session.refresh(refreshToken));

export const api = createClient({
  baseUrl: apiUrl(),
  getToken: () => auth.accessToken(),
  refresh: () => auth.refresh(),
});

export const useAuth = () => useSyncExternalStore(auth.subscribe, auth.get);

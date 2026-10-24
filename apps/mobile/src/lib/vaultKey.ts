import { fromB64, toB64, type VaultSecure } from '@dyc/core';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { keyOpens, type VaultKey } from './vaultCrypto';

/**
 * Abrir la Bóveda con huella o Face ID. Tras abrirla una vez con la
 * contraseña maestra, la clave (no la contraseña) se guarda en el llavero del
 * teléfono con `requireAuthentication`: el sistema solo la entrega tras la
 * huella o Face ID, y se invalida si cambian las huellas o caras registradas.
 * Va ligada a la sal de la bóveda: si la bóveda se borra y se crea otra, no sirve.
 */

const KEY = 'dyc.vault.key';
const PROMPT = { requireAuthentication: true, authenticationPrompt: 'Abre tu Bóveda' } as const;

/** ¿El teléfono puede guardar la clave tras la huella o Face ID? (Nunca en la vista web.) */
export function biometricsAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/** Marca sin secreto para saber si hay clave guardada sin pedir la huella. */
const MARK = 'dyc.vault.key.salt';

export async function hasSavedKey(vault: Pick<VaultSecure, 'kdf'>): Promise<boolean> {
  if (!biometricsAvailable()) return false;
  return (await SecureStore.getItemAsync(MARK).catch(() => null)) === vault.kdf.salt;
}

export async function saveKey(vault: Pick<VaultSecure, 'kdf'>, key: VaultKey): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(KEY, toB64(key), PROMPT);
    await SecureStore.setItemAsync(MARK, vault.kdf.salt);
    return true;
  } catch {
    return false;
  }
}

/** Pide la huella o Face ID y devuelve la clave si abre esta bóveda; null si se cancela o ya no vale. */
export async function loadKey(vault: Pick<VaultSecure, 'kdf' | 'check'>): Promise<VaultKey | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, PROMPT);
    if (!raw) return null;
    const key = fromB64(raw);
    return keyOpens(vault, key) ? key : null;
  } catch {
    return null;
  }
}

export async function forgetKey(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(KEY).catch(() => undefined), SecureStore.deleteItemAsync(MARK).catch(() => undefined)]);
}

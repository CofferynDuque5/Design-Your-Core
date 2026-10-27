import { Linking } from 'react-native';

/** La app web, donde se abren Bóveda y Asistente (solo están en la web). */
export function webUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_URL;
  return (fromEnv || 'https://app.designyourcore.nvcorx.com').replace(/\/+$/, '');
}

/** Abre una ruta de la web en el navegador del teléfono. */
export const openOnWeb = (path: string) => Linking.openURL(`${webUrl()}${path}`);

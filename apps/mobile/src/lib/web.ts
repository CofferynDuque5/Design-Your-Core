import { Linking } from 'react-native';

/** La app web, donde están las herramientas que aún no llegan al móvil. */
export function webUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_URL;
  return (fromEnv || 'https://app.designyourcore.nvcorx.com').replace(/\/+$/, '');
}

/** Abre una ruta de la web en el navegador del teléfono. */
export const openOnWeb = (path: string) => Linking.openURL(`${webUrl()}${path}`);

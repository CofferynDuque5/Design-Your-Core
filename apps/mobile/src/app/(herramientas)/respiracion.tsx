import { Redirect } from 'expo-router';

/** Respiración se quitó: un enlace viejo lleva a Más. Los minutos guardados siguen en tus datos. */
export default function Respiracion() {
  return <Redirect href="/mas" />;
}

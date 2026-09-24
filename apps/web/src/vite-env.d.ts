/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de la API. Vacío = mismo dominio (o el proxy de Vite en desarrollo). */
  readonly VITE_API_URL?: string;
  /** URL de la app anterior, para la sección Más. */
  readonly VITE_LEGACY_APP_URL?: string;
}

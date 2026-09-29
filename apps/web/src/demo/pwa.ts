/**
 * Sustituye a `virtual:pwa-register/react` en la versión de prueba: sin
 * service worker ni avisos de versión nueva (ver vite.config.ts).
 */
export function useRegisterSW() {
  const noop = () => {};
  return {
    needRefresh: [false, noop] as [boolean, (v: boolean) => void],
    offlineReady: [false, noop] as [boolean, (v: boolean) => void],
    updateServiceWorker: async (_reload?: boolean) => {},
  };
}

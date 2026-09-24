import { useRegisterSW } from 'virtual:pwa-register/react';

/** Aviso cuando hay una versión nueva de la app lista para usar. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toasts" aria-live="polite">
      <div className="toast">
        <span>Hay una versión nueva de la app.</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => updateServiceWorker(true)}>
          Actualizar
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNeedRefresh(false)}>
          Ahora no
        </button>
      </div>
    </div>
  );
}

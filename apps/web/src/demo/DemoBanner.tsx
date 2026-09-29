import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { resetDemo } from './boot';
import './demo.css';

/** Aviso fijo de la versión de prueba, con un botón para volver a los datos de ejemplo. */
export function DemoBanner() {
  const [confirming, setConfirming] = useState(false);
  return (
    <aside className="demo-banner" aria-label="Versión de prueba">
      <p>
        <strong>Versión de prueba:</strong> los datos son de ejemplo y solo se guardan en este navegador
      </p>
      <div className="demo-banner__actions">
        {confirming ? (
          <>
            <span role="status">Se perderán tus cambios.</span>
            <button type="button" className="btn btn--secondary btn--sm" onClick={resetDemo}>
              <RotateCcw size={14} aria-hidden="true" /> Sí, restablecer
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(true)}>
            <RotateCcw size={14} aria-hidden="true" /> Restablecer datos
          </button>
        )}
      </div>
    </aside>
  );
}

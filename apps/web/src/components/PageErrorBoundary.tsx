import { RotateCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';

const RELOAD_KEY = 'dyc.recargaPorVersion';

/** El código de una sección no llegó: suele ser que se subió una versión nueva con la app abierta. */
export function isChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|MIME type/i.test(msg);
}

/**
 * Recarga la página una sola vez para traer la versión nueva. Si ya se recargó hace
 * poco y sigue fallando, no insiste (evita un bucle) y devuelve false.
 */
export function reloadForNewVersion(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Sin almacenamiento no se puede saber si ya se recargó: mejor no arriesgar un bucle.
    return false;
  }
  window.location.reload();
  return true;
}

interface Props {
  children: ReactNode;
  /** Cambia al navegar: la sección nueva se intenta abrir de cero. */
  resetKey: string;
}

interface State {
  error: unknown;
}

/**
 * Si una sección falla al abrirse, el menú sigue a la vista y la persona puede
 * recargar o ir a otra sección. Antes, un fallo así dejaba toda la app en blanco.
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown) {
    if (isChunkError(error)) reloadForNewVersion();
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const update = isChunkError(error);
    return (
      <div className="page page--narrow">
        <div className="empty-state error-state" role="alert">
          <h4>{update ? 'Hay una versión nueva de la app' : 'No se pudo abrir esta sección'}</h4>
          <p>
            {update
              ? 'Esta sección cambió desde que abriste la app. Recarga para abrirla con la versión nueva; tus datos no se pierden.'
              : 'Algo falló al mostrarla. Recarga la app o abre otra sección desde el menú.'}
          </p>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => window.location.reload()}>
            <RotateCw size={16} aria-hidden="true" /> Recargar
          </button>
        </div>
      </div>
    );
  }
}

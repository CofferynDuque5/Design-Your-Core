import { ApiError } from '@dyc/api-client';
import { CloudOff, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Algo salió mal. Inténtalo de nuevo.';
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const offline = error instanceof ApiError && error.isNetwork;
  return (
    <div className="empty-state error-state" role="alert">
      {offline && <CloudOff size={24} aria-hidden="true" />}
      <h4>{offline ? 'Sin conexión' : 'No se pudo cargar'}</h4>
      <p>{errorMessage(error)}</p>
      {retry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={retry}>
          <RotateCw size={16} aria-hidden="true" /> Reintentar
        </button>
      )}
    </div>
  );
}

/** Bloques de carga con la forma aproximada del contenido. */
export function Skeleton({ lines = 3, height = 20 }: { lines?: number; height?: number }) {
  return (
    <div className="stack-sm" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton" style={{ height, width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function Loading({ label = 'Cargando' }: { label?: string }) {
  return (
    <div className="card" aria-busy="true">
      <span className="visually-hidden" role="status">
        {label}…
      </span>
      <Skeleton />
    </div>
  );
}

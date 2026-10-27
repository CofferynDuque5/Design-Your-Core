import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkError, PageErrorBoundary, reloadForNewVersion } from './PageErrorBoundary';

const reload = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  reload.mockReset();
  sessionStorage.clear();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

function Boom({ error }: { error: Error }): never {
  throw error;
}

describe('secciones que no se pueden abrir', () => {
  it('reconoce el fallo al descargar el código de una sección', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/More-abc.js'))).toBe(true);
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkError(new Error('No se pudo cargar'))).toBe(false);
  });

  it('recarga una sola vez para traer la versión nueva, sin bucles', () => {
    expect(reloadForNewVersion(1_000_000)).toBe(true);
    expect(reloadForNewVersion(1_010_000)).toBe(false);
    expect(reloadForNewVersion(1_100_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('muestra un aviso con «Recargar» en vez de dejar la app en blanco', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sessionStorage.setItem('dyc.recargaPorVersion', String(Date.now()));
    render(
      <>
        <nav aria-label="Principal">menú</nav>
        <PageErrorBoundary resetKey="/mas">
          <Boom error={new TypeError('Failed to fetch dynamically imported module: /assets/More-abc.js')} />
        </PageErrorBoundary>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Hay una versión nueva de la app');
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    // Ya se había recargado hace un momento: no insiste.
    expect(reload).not.toHaveBeenCalled();
  });

  it('al ir a otra sección vuelve a intentarlo', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <PageErrorBoundary resetKey="/agenda">
        <Boom error={new Error('fallo')} />
      </PageErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo abrir esta sección');
    rerender(
      <PageErrorBoundary resetKey="/pendientes">
        <p>Pendientes</p>
      </PageErrorBoundary>,
    );
    expect(screen.getByText('Pendientes')).toBeInTheDocument();
  });
});

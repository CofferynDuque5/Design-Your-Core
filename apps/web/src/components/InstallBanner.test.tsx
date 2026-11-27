import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// El aviso se decide al cargar el módulo (lee ?instalar de la dirección).
async function load(search: string) {
  window.history.replaceState(null, '', `/${search}`);
  vi.resetModules();
  return (await import('./InstallBanner')).InstallBanner;
}

describe('Instalar la app', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('no aparece si el enlace no lo pide', async () => {
    const InstallBanner = await load('');
    render(<InstallBanner />);
    expect(screen.queryByRole('heading', { name: 'Instala Design Your Core' })).toBeNull();
  });

  it('con ?instalar usa el diálogo del navegador cuando lo ofrece', async () => {
    const InstallBanner = await load('?instalar');
    const prompt = vi.fn(async () => undefined);
    const ev = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }) });
    window.dispatchEvent(ev);
    render(<InstallBanner />);
    expect(screen.getByRole('heading', { name: 'Instala Design Your Core' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Instalar/ }));
    expect(prompt).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Listo: ya tienes la app' })).toBeInTheDocument();
  });

  it('sin diálogo del navegador explica cómo hacerlo y se puede cerrar', async () => {
    const InstallBanner = await load('?instalar');
    render(<InstallBanner />);
    expect(screen.getByText(/«Instalar Design Your Core» o «Añadir a pantalla de inicio»/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('heading', { name: 'Instala Design Your Core' })).toBeNull();
  });
});

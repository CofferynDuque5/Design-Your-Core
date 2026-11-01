import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * «Instalar la app»: el sitio enlaza a la app con `?instalar` (botón
 * «Descargar» de Android, iPhone o la computadora). En Chrome, Edge y
 * Android se abre el diálogo del navegador para instalarla; en iPhone y iPad
 * se explica cómo añadirla a la pantalla de inicio desde Safari.
 */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Se lee al cargar: las redirecciones de la app (a /entrar) quitan la consulta.
const wanted = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('instalar');
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
}

const installed = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function InstallBanner() {
  const [open, setOpen] = useState(wanted && !installed());
  const [canPrompt, setCanPrompt] = useState(deferred !== null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const l = () => setCanPrompt(deferred !== null);
    listeners.add(l);
    const onInstalled = () => setDone(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      listeners.delete(l);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!open) return null;
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    setCanPrompt(false);
    if (outcome === 'accepted') setDone(true);
  };

  return (
    <section className="install-banner" aria-labelledby="install-title">
      <div className="install-banner__body">
        <h2 id="install-title" className="install-banner__title">
          {done ? 'Listo: ya tienes la app' : 'Instala Design Your Core'}
        </h2>
        <p className="install-banner__text">
          {done
            ? 'Búscala entre tus apps o en la pantalla de inicio.'
            : canPrompt
              ? 'Se abre en su propia ventana, con su icono, y funciona aunque la conexión sea lenta.'
              : isIos()
                ? 'En Safari, toca Compartir y luego «Añadir a pantalla de inicio».'
                : 'En el menú del navegador, elige «Instalar Design Your Core» o «Añadir a pantalla de inicio».'}
        </p>
      </div>
      {!done && canPrompt && (
        <button type="button" className="btn" onClick={install}>
          <Download size={18} aria-hidden="true" /> Instalar
        </button>
      )}
      {!done && !canPrompt && isIos() && <Share size={22} aria-hidden="true" className="install-banner__icon" />}
      <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setOpen(false)}>
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

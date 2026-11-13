import '@dyc/tokens/tokens.css';
import '@dyc/tokens/components.css';
import '../styles/app.css';
import '../styles/estilos/index.css';
import '../styles/paletas.css';
import '../styles/tipografias.css';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyFont, DEFAULT_FONT } from './font';
import { applyPalette, DEFAULT_PALETTE } from './palette';
import { applyStyle, DEFAULT_STYLE } from './style';
import { applyTheme, storedTheme } from './theme';

/**
 * Arranca la app. Las fuentes las pone quien llama: main.tsx las lleva en el
 * paquete y la versión de prueba (src/demo/main.tsx) las pide a Google Fonts.
 * `before` se pinta encima de la app (el aviso de la versión de prueba).
 */
export function start(before?: ReactNode) {
  // index.html ya aplicó tema, estilo, tipografía y paleta antes de pintar; esto cubre el caso en
  // que su script no pudo y, además, carga las fuentes de una tipografía que no sea la clásica.
  applyTheme(storedTheme());
  // Estilo, tipografía y color ya no se eligen en Perfil: siempre los de la marca.
  applyStyle(DEFAULT_STYLE);
  applyFont(DEFAULT_FONT);
  applyPalette(DEFAULT_PALETTE);

  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      {before}
      <App />
    </StrictMode>,
  );
}

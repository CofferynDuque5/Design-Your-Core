import '@fontsource/figtree/latin-300.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/latin-400-italic.css';
import '@dyc/tokens/tokens.css';
import '@dyc/tokens/components.css';
import './styles/app.css';
import './styles/estilos/index.css';
import './styles/paletas.css';
import './styles/tipografias.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyFont, storedFont } from './app/font';
import { applyPalette, storedPalette } from './app/palette';
import { applyStyle, storedStyle } from './app/style';

// index.html ya aplicó estilo, tipografía y paleta antes de pintar; esto cubre el caso en
// que su script no pudo y, además, carga las fuentes de una tipografía que no sea la clásica.
applyStyle(storedStyle());
applyFont(storedFont());
applyPalette(storedPalette());

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

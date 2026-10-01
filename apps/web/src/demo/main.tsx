// Entrada de la versión de prueba (pnpm build:demo, ver docs/demo.md). Igual que
// main.tsx pero sin las fuentes en el paquete (llegan de Google Fonts, en el HTML)
// y con el aviso de prueba encima de la app.
import { prepareDemo } from './boot';
import { DemoBanner } from './DemoBanner';
import { start } from '../app/start';

prepareDemo();
start(<DemoBanner />);

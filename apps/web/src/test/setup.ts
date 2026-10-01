import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Se registran a mano: con pnpm, "@testing-library/jest-dom/vitest" puede cargar otra copia de vitest.
expect.extend(matchers);

// En CI las pruebas de la Bóveda (PBKDF2 de 600 000 vueltas) cargan la CPU en paralelo:
// 1 s de espera por defecto se queda corto para el primer render de un archivo.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

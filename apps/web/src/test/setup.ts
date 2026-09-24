import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Se registran a mano: con pnpm, "@testing-library/jest-dom/vitest" puede cargar otra copia de vitest.
expect.extend(matchers);

afterEach(() => {
  cleanup();
  localStorage.clear();
});

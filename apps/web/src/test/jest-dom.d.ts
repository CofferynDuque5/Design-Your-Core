// Tipos de los matchers de jest-dom (toBeInTheDocument, toBeChecked…) para Vitest.
// Se declaran aquí porque con pnpm el paquete no siempre resuelve "vitest" por sí solo.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}

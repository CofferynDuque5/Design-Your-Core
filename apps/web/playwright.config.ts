import { defineConfig, devices } from '@playwright/test';

// Recorrido de punta a punta: la web compilada (vite preview) contra la API
// real y una base de datos de pruebas. Requiere `pnpm build` antes.
// Nunca apuntes E2E_DATABASE_URL a producción: se crean cuentas de prueba.
const DB = process.env.E2E_DATABASE_URL || process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/core_test';
const API_PORT = 4610;
const WEB_PORT = 4183;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'es-ES',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
  ],
  webServer: [
    {
      command: 'node ../api/dist/index.js',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { DATABASE_URL: DB, PORT: String(API_PORT), NODE_ENV: 'test', CLIENT_ORIGIN: `http://localhost:${WEB_PORT}` },
      reuseExistingServer: false,
    },
    {
      command: `vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { DYC_API_PROXY: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});

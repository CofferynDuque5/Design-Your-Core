import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// Dominio público del sitio (para el sitemap y las URL canónicas).
const SITE = process.env.SITE_URL || 'https://designyourcore.nvcorx.com';

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap()],
  server: { port: 4321 },
});

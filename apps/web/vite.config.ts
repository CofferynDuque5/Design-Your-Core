/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// En desarrollo, /api va a la API local (pnpm dev:api, puerto 4600).
// En producción, VITE_API_URL apunta a la API pública; vacío = mismo dominio.
const API_TARGET = process.env.DYC_API_PROXY || 'http://localhost:4600';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Design Your Core',
        short_name: 'Core',
        description: 'Tu bienestar en seis pilares: movimiento, descanso, alimentación, enfoque, relaciones y propósito.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F4F3EF',
        theme_color: '#1E3A5F',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // La API nunca se cachea: los datos van por TanStack Query.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': API_TARGET, '/reset': API_TARGET },
  },
  preview: {
    port: 4173,
    proxy: { '/api': API_TARGET, '/reset': API_TARGET },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});

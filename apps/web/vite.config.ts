/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// En desarrollo, /api va a la API local (pnpm dev:api, puerto 4600).
// En producción, VITE_API_URL apunta a la API pública; vacío = mismo dominio.
const API_TARGET = process.env.DYC_API_PROXY || 'http://localhost:4600';

// Familias de las tipografías que se cargan solo al elegirlas (src/app/font.ts).
const OPTIONAL_FONTS = ['manrope', 'outfit', 'dm-sans', 'fraunces', 'source-sans-3', 'nunito'];

/**
 * Versión de prueba (`vite build --mode demo` o VITE_DEMO=1; ver docs/demo.md):
 * la app entera en un solo HTML, con una API falsa en el navegador (src/demo/),
 * sin service worker y con las fuentes de Google Fonts.
 */
const GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&amp;family=Figtree:wght@300;400;500;600&amp;family=Fraunces:ital,wght@0,300;0,400;1,400&amp;family=Manrope:wght@300;400;500;600&amp;family=Newsreader:ital,wght@0,400;1,400&amp;family=Nunito:wght@300;400;500;600;700&amp;family=Outfit:wght@300;500&amp;family=Source+Sans+3:wght@400;500;600&amp;display=swap';

function demoHtml(): Plugin {
  const favicon = `data:image/svg+xml,${encodeURIComponent(readFileSync(new URL('./public/favicon.svg', import.meta.url), 'utf8').trim())}`;
  return {
      name: 'dyc-demo-html',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          html
            .replace('/src/main.tsx', '/src/demo/main.tsx')
            .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${favicon}" type="image/svg+xml" />`)
            .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
            .replace(
              '</title>',
              `</title>\n    <meta name="robots" content="noindex" />\n    <link rel="preconnect" href="https://fonts.googleapis.com" />\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n    <link rel="stylesheet" href="${GOOGLE_FONTS}" />`,
            ),
      },
    };
  }

  export default defineConfig(({ mode }) => {
    const demo = mode === 'demo' || process.env.VITE_DEMO === '1';
    return {
    define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo ? '1' : '') },
    plugins: [
      react(),
      demo ? demoHtml() : VitePWA({
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
          background_color: '#0A0B09',
          theme_color: '#0A0B09',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Las fuentes de las tipografías opcionales (Perfil → Tipografía) no se precachean:
          // se guardan la primera vez que se usan, para no descargarlas todas al instalar.
          globIgnores: [`**/{${OPTIONAL_FONTS.join(',')}}-*.woff2`],
          runtimeCaching: [
            {
              urlPattern: new RegExp(`/assets/(${OPTIONAL_FONTS.join('|')})-[^/]+\\.woff2?$`),
              handler: 'CacheFirst',
              options: { cacheName: 'dyc-fuentes', expiration: { maxEntries: 40 } },
            },
          ],
          navigateFallback: '/index.html',
          // La API nunca se cachea: los datos van por TanStack Query.
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
    ...(demo && {
      base: './',
      publicDir: false as const,
      // Sin service worker: el aviso de versión nueva no hace nada.
      resolve: { alias: [{ find: /^virtual:pwa-register\/react$/, replacement: fileURLToPath(new URL('./src/demo/pwa.ts', import.meta.url)) }] },
      build: {
        outDir: 'dist-demo/build',
        emptyOutDir: true,
        // Un solo JS y un solo CSS, sin archivos aparte: scripts/inline-demo.mjs los mete en el HTML.
        cssCodeSplit: false,
        assetsInlineLimit: () => true,
        modulePreload: false,
        chunkSizeWarningLimit: 4000,
        rolldownOptions: { output: { codeSplitting: false } },
      },
    }),
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
  };
});

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

interface VercelHeaders {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

/** The headers that Vercel sends on every path, so `vite preview` runs under the production CSP. */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as VercelHeaders;
  const all = config.headers.find((h) => h.source === '/(.*)');
  return Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
}

/**
 * The interface fonts, which every page needs and the service worker installs: Fraunces, Newsreader, Inter
 * and JetBrains Mono as `styles/index.css` imports them, and MathLive's KaTeX fonts. Every other font file
 * is a writing font that loads on first use.
 */
const APP_FONT =
  /^(newsreader-|fraunces-.+-full-normal|inter-.+-opsz-normal|jetbrains-mono-.+-400-normal|KaTeX_)/;

function isWritingFont(name: string): boolean {
  return /\.(woff2?)$/.test(name) && !APP_FONT.test(name);
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'generateSW',
      injectRegister: false,
      includeAssets: ['icons/favicon-48.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Vlo',
        short_name: 'Vlo',
        description: 'Write in flow. A free, local-first writing app for novelists, memoirists and poets.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0e0d0c',
        background_color: '#0e0d0c',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,woff2,webmanifest}'],
        // The writing fonts are not in the install cache. Each one is cached the first time it loads.
        globIgnores: ['assets/fonts/**'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/fonts\/[^/]+\.woff2?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'vlo-writing-fonts',
              // File names carry a content hash, so a cached file never goes stale.
              expiration: { maxEntries: 400 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // The TrueType files that PDF and EPUB exports embed. Their names carry no hash, so the cached
            // copy serves the export at once and a changed file replaces it in the background.
            urlPattern: /\/fonts\/[^/]+\/[^/]+\.ttf$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'vlo-export-fonts',
              expiration: { maxEntries: 120 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Module workers, so the export worker loads each format's code only when the writer picks it.
  worker: { format: 'es' },
  build: {
    manifest: true,
    sourcemap: true,
    // Fonts stay as files: the CSP allows fonts only from 'self', not from data: URLs.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    rolldownOptions: {
      output: {
        // The writing fonts go under assets/fonts/, so the service worker can leave them out of its install.
        assetFileNames: (asset) =>
          isWritingFont(asset.names[0] ?? '')
            ? 'assets/fonts/[name]-[hash][extname]'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  preview: { headers: productionHeaders() },
});

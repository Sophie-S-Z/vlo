import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { manifest: true, sourcemap: true },
});

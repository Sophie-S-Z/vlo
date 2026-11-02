import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { SEED_BUNDLE_DIR } from './seed-bundle';

/** Builds tests/fixtures/seed-entry.ts into one script that defines `window.vloSeed`. */
export default async function globalSetup(): Promise<void> {
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    resolve: { alias: { '@': fileURLToPath(new URL('../../../src', import.meta.url)) } },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir: SEED_BUNDLE_DIR,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('../../fixtures/seed-entry.ts', import.meta.url)),
        formats: ['iife'],
        name: 'vloSeedBundle',
        fileName: () => 'seed.js',
      },
    },
  });
}

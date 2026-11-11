import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/* The seed bundle that global-setup.ts builds from tests/fixtures/seed-entry.ts. */

export const SEED_BUNDLE_DIR = fileURLToPath(new URL('../../../node_modules/.tmp/e2e', import.meta.url));

export interface SeededLarge {
  projectId: string;
  longSceneId: string;
  longSceneTitle: string;
  longSceneEnd: string;
}

export interface PoemLine {
  text: string;
  hanging: number;
}

interface VloSeed {
  large: (seed: number, words?: number) => Promise<SeededLarge>;
  readPoem: (itemId: string) => Promise<PoemLine[][]>;
}

/**
 * Adds the seed bundle to the page. Vlo's CSP allows only its own scripts, so the test's context must set
 * `bypassCSP: true`.
 */
export async function addSeed(page: Page): Promise<void> {
  await page.addScriptTag({ path: `${SEED_BUNDLE_DIR}/seed.js` });
  await expect.poll(() => page.evaluate(() => 'vloSeed' in window)).toBe(true);
}

/** Writes the 100,000-word project, or one of `words` words, into the page's IndexedDB. */
export async function seedLarge(page: Page, seed = 1, words?: number): Promise<SeededLarge> {
  await addSeed(page);
  return page.evaluate(({ s, w }) => (window as unknown as { vloSeed: VloSeed }).vloSeed.large(s, w), {
    s: seed,
    w: words,
  });
}

/** Reads a poem's stored lines and hanging indents straight from IndexedDB. */
export async function readStoredPoem(page: Page, itemId: string): Promise<PoemLine[][]> {
  await addSeed(page);
  return page.evaluate((id) => (window as unknown as { vloSeed: VloSeed }).vloSeed.readPoem(id), itemId);
}

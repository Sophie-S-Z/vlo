import { describe, expect, test } from 'vitest';
import { initialChunks, BUDGET_BYTES } from '../../scripts/bundle-size-lib.mjs';

const manifest = {
  'index.html': { file: 'assets/index.js', isEntry: true, imports: ['_a.js'], css: ['assets/index.css'] },
  '_a.js': { file: 'assets/a.js', imports: ['_b.js'], dynamicImports: ['src/lazy.ts'] },
  '_b.js': { file: 'assets/b.js', imports: ['_a.js'] },
  'src/lazy.ts': { file: 'assets/lazy.js', isDynamicEntry: true, imports: ['_b.js'] },
};

describe('initialChunks', () => {
  test('follows static imports from the entry and skips dynamic imports', () => {
    expect(initialChunks(manifest, 'index.html').sort()).toEqual([
      'assets/a.js',
      'assets/b.js',
      'assets/index.js',
    ]);
  });

  test('throws when the entry is missing', () => {
    expect(() => initialChunks(manifest, 'missing.html')).toThrow('missing.html');
  });

  test('the budget is 250,000 bytes', () => {
    expect(BUDGET_BYTES).toBe(250_000);
  });
});

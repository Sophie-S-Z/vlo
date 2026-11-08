import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, test } from 'vitest';

/*
 * The Share panel loads as its own chunk. A static import of the export runner once pulled the PDF font
 * code (fontkit, about 330 KB gzip) into that chunk. This test follows the static imports, as the bundler
 * does, and checks that sharing reaches no PDF code.
 */

const root = resolve(import.meta.dirname, '../..');
/** A static import or re-export of values. `import type` and `export type` load nothing. */
const IMPORT = /^(?:import|export)\s+(?!type\s)(?:[^;]*?\sfrom\s+)?'([^']+)';/gm;

function resolveFile(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(root, 'src', spec.slice(2)) : resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

/** The files and packages that `entry` loads through static imports. */
function staticGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [join(root, entry)];
  for (const file of queue) {
    if (files.has(file)) continue;
    files.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    for (const [, spec = ''] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const target = resolveFile(file, spec);
        if (target) queue.push(target);
      } else packages.add(spec);
    }
  }
  return { files: new Set([...files].map((f) => relative(root, f))), packages };
}

test('the export runner reaches the PDF font code, so the check below can see it', () => {
  expect(staticGraph('src/features/export/run.ts').packages).toContain('@pdf-lib/fontkit');
});

test('the Share panel reaches the share-safe export tree but no PDF code', () => {
  const { files, packages } = staticGraph('src/features/share/SharePanel.tsx');
  expect(files).toContain('src/features/export/safeTree.ts');
  expect([...packages].filter((name) => name.includes('pdf-lib'))).toEqual([]);
});

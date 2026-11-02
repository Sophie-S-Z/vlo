import { expect, test } from 'vitest';
import { disallowed, toMarkdown } from '../../scripts/licenses-lib.mjs';

const rows = [
  { name: 'react', version: '19.3.1', license: 'MIT', dev: false },
  { name: 'lucide-react', version: '1.66.0', license: 'ISC', dev: false },
  { name: 'gpl-thing', version: '1.0.0', license: 'GPL-3.0', dev: true },
  { name: 'no-license', version: '1.0.0', license: 'UNKNOWN', dev: true },
];

test('disallowed lists packages outside the license allowlist', () => {
  expect(disallowed(rows).map((r) => r.name)).toEqual(['gpl-thing', 'no-license']);
});

test('toMarkdown writes one table row per package, sorted by name', () => {
  const md = toMarkdown(rows.slice(0, 2));
  expect(md).toContain('| lucide-react | 1.66.0 | ISC | runtime |');
  expect(md.indexOf('lucide-react')).toBeLessThan(md.indexOf('| react |'));
});

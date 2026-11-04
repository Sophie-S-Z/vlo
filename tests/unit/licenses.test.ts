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

test('a dual license passes when one of its choices is allowed', () => {
  const dual = [
    { name: 'jszip', version: '3.10.2', license: '(MIT OR GPL-3.0-or-later)', dev: false },
    { name: 'gpl-or-agpl', version: '1.0.0', license: '(GPL-3.0 OR AGPL-3.0)', dev: false },
  ];
  expect(disallowed(dual).map((r) => r.name)).toEqual(['gpl-or-agpl']);
});

test('toMarkdown writes one table row per package, sorted by name', () => {
  const md = toMarkdown(rows.slice(0, 2));
  expect(md).toContain('| lucide-react | 1.66.0 | ISC | runtime |');
  expect(md.indexOf('lucide-react')).toBeLessThan(md.indexOf('| react |'));
});

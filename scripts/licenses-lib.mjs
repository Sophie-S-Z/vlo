export const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'OFL-1.1',
  '0BSD',
  'MPL-2.0',
  'CC0-1.0',
]);

/**
 * True when the license is on the allowlist. A dual license such as "(MIT OR GPL-3.0-or-later)" lets the
 * user pick one, so one allowed choice is enough.
 */
export function isAllowed(license) {
  const choices = license.replace(/^\((.*)\)$/, '$1').split(/\s+OR\s+/);
  return choices.some((choice) => ALLOWED.has(choice.trim()));
}

/** Returns the rows whose license is outside the allowlist. */
export function disallowed(rows) {
  return rows.filter((r) => !isAllowed(r.license));
}

/** Renders the rows as the body of docs/licenses.md. */
export function toMarkdown(rows) {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    '# Licenses',
    '',
    'This file lists every direct dependency and its license. `npm run licenses` writes it. Do not edit it by hand.',
    '',
    'Vlo itself uses the MIT license. Self-hosted fonts use the SIL Open Font License 1.1.',
    '',
    '| Package | Version | License | Used at |',
    '| --- | --- | --- | --- |',
    ...sorted.map(
      (r) => `| ${r.name} | ${r.version} | ${r.license} | ${r.dev ? 'build and test' : 'runtime'} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

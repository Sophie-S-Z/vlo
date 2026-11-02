import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { disallowed, toMarkdown } from './licenses-lib.mjs';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function licenseOf(meta) {
  if (typeof meta.license === 'string') return meta.license;
  if (meta.license && typeof meta.license.type === 'string') return meta.license.type;
  return 'UNKNOWN';
}

const rows = [];
for (const [deps, dev] of [
  [pkg.dependencies ?? {}, false],
  [pkg.devDependencies ?? {}, true],
]) {
  for (const name of Object.keys(deps)) {
    const meta = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'));
    rows.push({ name, version: meta.version, license: licenseOf(meta), dev });
  }
}

writeFileSync(join(root, 'docs', 'licenses.md'), toMarkdown(rows));

const bad = disallowed(rows);
if (bad.length > 0) {
  for (const r of bad) console.error(`License not allowed: ${r.name} ${r.version} (${r.license})`);
  process.exit(1);
}
console.log(`Wrote docs/licenses.md with ${rows.length} packages.`);

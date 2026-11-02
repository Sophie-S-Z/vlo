// Checks the initial JavaScript budget. Run after `npm run build`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BUDGET_BYTES, initialChunks } from './bundle-size-lib.mjs';

const dist = join(process.cwd(), 'dist');
const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));

let total = 0;
for (const file of initialChunks(manifest, 'index.html')) {
  const size = gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;
  total += size;
  console.log(`${String(size).padStart(9)}  ${file}`);
}
console.log(`${String(total).padStart(9)}  total gzip bytes (budget ${String(BUDGET_BYTES)})`);

if (total >= BUDGET_BYTES) {
  console.error(`Initial JavaScript is over budget by ${String(total - BUDGET_BYTES)} bytes.`);
  process.exit(1);
}

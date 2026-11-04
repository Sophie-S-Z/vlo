/*
 * Fetches the TTF files that PDF and EPUB exports embed (spec section 9) into public/fonts/<id>/, with each
 * family's OFL license. The fonts come from the Google Fonts CSS API, which serves fixed-weight TrueType
 * files at 400 and 700, and the licenses come from the google/fonts repository. Each file's SHA-256 is
 * pinned in src/features/export/pdf-fonts.lock.json, so a changed upstream file stops the script.
 *
 *   node scripts/fetch-fonts.mjs          fetch missing files and check every hash
 *   node scripts/fetch-fonts.mjs --pin    write the hashes of the files on disk to the lock file
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const list = JSON.parse(readFileSync(join(root, 'src/features/export/pdf-fonts.json'), 'utf8'));
const lockPath = join(root, 'src/features/export/pdf-fonts.lock.json');
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : {};
const pin = process.argv.includes('--pin');

/** Each style as the CSS API names it: italic (0 or 1) and weight. */
const AXES = { regular: [0, 400], bold: [0, 700], italic: [1, 400], boldItalic: [1, 700] };

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fetchOk(url) {
  // With no browser user agent, the CSS API answers with TrueType files instead of WOFF2.
  const response = await fetch(url, { headers: { 'User-Agent': 'vlo-fetch-fonts' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${String(response.status)}`);
  return response;
}

/** The TrueType file address of each style of a family. */
async function fileUrls(font) {
  const tuples = font.styles
    .map((s) => AXES[s])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([ital, wght]) => `${String(ital)},${String(wght)}`);
  const url = `${list.source}?family=${font.family.replace(/ /g, '+')}:ital,wght@${tuples.join(';')}`;
  const css = await (await fetchOk(url)).text();
  const out = {};
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const italic = /font-style:\s*italic/.test(block) ? 1 : 0;
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1]);
    const src = /url\((https:[^)]+\.ttf)\)/.exec(block)?.[1];
    const style = Object.keys(AXES).find((s) => AXES[s][0] === italic && AXES[s][1] === weight);
    if (style && src) out[style] = src;
  }
  for (const style of font.styles) {
    if (!out[style]) throw new Error(`${font.family}: the CSS API has no ${style} TrueType file.`);
  }
  return out;
}

const next = {};
let failed = false;
for (const [id, font] of Object.entries(list.fonts)) {
  const names = [...font.styles.map((s) => `${s}.ttf`), 'OFL.txt'];
  const missing = names.some((name) => !existsSync(join(root, 'public/fonts', id, name)));
  const urls = missing ? await fileUrls(font) : {};
  for (const name of names) {
    const path = join(root, 'public/fonts', id, name);
    const key = `${id}/${name}`;
    if (!existsSync(path)) {
      const url = name === 'OFL.txt' ? `${list.license}/${font.dir}/OFL.txt` : urls[name.replace('.ttf', '')];
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(await (await fetchOk(url)).arrayBuffer()));
      console.log(`fetched ${key}`);
    }
    const hash = sha256(readFileSync(path));
    next[key] = hash;
    if (!pin && lock[key] !== hash) {
      console.error(`${key}: hash ${hash} does not match the lock file (${String(lock[key])}).`);
      failed = true;
    }
  }
}
if (pin) {
  writeFileSync(lockPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`pinned ${String(Object.keys(next).length)} files`);
} else if (failed) {
  process.exit(1);
} else {
  console.log(`all ${String(Object.keys(next).length)} files match the lock file`);
}

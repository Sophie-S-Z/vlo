#!/usr/bin/env node
/*
 * Builds the reference passages for the deep check (src/features/analysis/deep/references.ts). The deep
 * check reads these passages once on the device and sets its cuts from the scores, so the cuts fit the
 * model, its quantization and the graphics card that the writer has.
 *
 * Usage: node scripts/build-deep-references.mjs <gutenberg dir> <state_union dir> <europarl english dir>
 *   <ghostbuster dir>
 *
 * Human passages come from public domain books (NLTK Gutenberg), State of the Union addresses (United
 * States government works, NLTK state_union) and European Parliament debates (Europarl). AI passages come
 * from ChatGPT and Claude texts in the Ghostbuster data, and from the newer-model test set in
 * scripts/ai-detector-data.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [gutenberg, stateUnion, europarl, ghostbuster] = process.argv.slice(2);
if (!gutenberg || !stateUnion || !europarl || !ghostbuster) {
  console.error(
    'Usage: node scripts/build-deep-references.mjs <gutenberg> <state_union> <europarl/english> <ghostbuster>',
  );
  process.exit(1);
}

let seed = 20261108;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

function ascii(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, ' - ')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e\n]/g, '')
    .replace(/[ \t]+/g, ' ');
}

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const words = (text) => text.split(/\s+/).filter(Boolean).length;

/** Consecutive sentences from one paragraph run, 90 to 140 words, that read as plain prose. */
function passage(text, skipShare = 0) {
  const flat = ascii(text)
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  const sentences = [...segmenter.segment(flat)].map((s) => s.segment.trim()).filter(Boolean);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const start = Math.floor(skipShare * sentences.length + random() * (1 - skipShare) * sentences.length);
    const picked = [];
    let count = 0;
    for (let i = start; i < sentences.length && count < 90; i += 1) {
      picked.push(sentences[i]);
      count += words(sentences[i]);
    }
    const out = picked.join(' ');
    if (count < 90 || count > 140) continue;
    if (!/^[A-Z]/.test(out) || !/[.!?]["']?$/.test(out)) continue;
    if ((out.match(/"/g) ?? []).length > 4) continue;
    if (/[A-Z]{5,}|\[|\]|_|\*|#|http/.test(out)) continue;
    return out;
  }
  return null;
}

const entries = [];
function add(kind, source, text, skipShare) {
  const found = passage(text, skipShare);
  if (found) entries.push({ kind, source, text: found });
  else console.warn(`No passage in ${source}`);
}

for (const name of [
  'austen-persuasion',
  'chesterton-brown',
  'chesterton-thursday',
  'austen-emma',
  'chesterton-ball',
  'melville-moby_dick',
])
  add('human', `Project Gutenberg, ${name}`, readFileSync(join(gutenberg, `${name}.txt`), 'utf8'), 0.15);

for (const name of [
  '1962-Kennedy',
  '1974-Nixon',
  '1979-Carter',
  '1988-Reagan',
  '1996-Clinton',
  '2004-GWBush',
])
  add('human', `State of the Union, ${name}`, readFileSync(join(stateUnion, `${name}.txt`), 'utf8'), 0.1);

/** Europarl text is tokenized, with a space before each mark. This joins the marks again. */
function detokenize(line) {
  return line
    .replace(/ ([.,;:?!%)])/g, '$1')
    .replace(/\( /g, '(')
    .replace(/ ' (s|t|re|ve|ll|d|m)\b/g, "'$1")
    .replace(/ n't\b/g, "n't");
}

for (const name of readdirSync(europarl).sort().slice(0, 6)) {
  const raw = readFileSync(join(europarl, name), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('<') && !line.includes('(The House') && words(line) >= 12)
    .map(detokenize)
    .join('\n');
  add('human', `Europarl, ${name}`, raw, 0.2);
}

function firstFiles(dir, count, offset) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .slice(offset, offset + count)
    .map((f) => join(dir, f));
}

for (const [dir, label] of [
  ['essay/gpt', 'ChatGPT essay'],
  ['essay/claude', 'Claude essay'],
  ['wp/gpt', 'ChatGPT story'],
  ['wp/claude', 'Claude story'],
]) {
  let added = 0;
  for (const file of firstFiles(join(ghostbuster, dir), 12, 900)) {
    if (added === (dir.startsWith('essay') ? 2 : 1)) break;
    const before = entries.length;
    add('ai', `Ghostbuster, ${label}`, readFileSync(file, 'utf8'), 0);
    if (entries.length > before) added += 1;
  }
}

const newer = join(import.meta.dirname, 'ai-detector-data/newer-model/test');
for (const name of ['02.txt', '06.txt', '10.txt'])
  add('ai', 'Newer-model test set', readFileSync(join(newer, name), 'utf8'), 0);

const human = entries.filter((e) => e.kind === 'human').length;
const ai = entries.length - human;
console.log(`${String(human)} human and ${String(ai)} AI passages`);

const body = entries
  .map(
    (e) =>
      `  {\n    kind: '${e.kind}',\n    source: ${JSON.stringify(e.source)},\n    text: ${JSON.stringify(e.text)},\n  },`,
  )
  .join('\n');
writeFileSync(
  join(import.meta.dirname, '../src/features/analysis/deep/references.ts'),
  `/*
 * Generated by scripts/build-deep-references.mjs. Do not edit by hand.
 *
 * The deep check reads these passages once on the device and sets its cuts from their scores. Human
 * passages: public domain books (Project Gutenberg), State of the Union addresses (United States
 * government works) and European Parliament debates (Europarl). AI passages: ChatGPT and Claude texts from
 * the Ghostbuster data, and texts from the newer-model test set.
 */

export interface Reference {
  kind: 'human' | 'ai';
  source: string;
  text: string;
}

export const REFERENCES: readonly Reference[] = [
${body}
];
`,
);

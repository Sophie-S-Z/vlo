// Fits the AI writing model in src/features/analysis/ai/model.ts, and reports how well it does on texts
// that it never saw. It needs no packages beyond the app's own TypeScript compiler.
//
//   node scripts/train-ai-detector.mjs <ghostbuster-data folder> <gutenberg folder>
//
// The labeled texts come from the Ghostbuster benchmark (https://github.com/vivek3141/ghostbuster-data):
// human and AI (ChatGPT and Claude) creative writing and student essays, with the same prompts for both, and
// essays by learners of English. The optional Gutenberg folder (NLTK's gutenberg corpus) adds published
// fiction as human text (git clone https://github.com/vivek3141/ghostbuster-data, and unzip
// https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/gutenberg.zip).
// scripts/ai-detector-data/newer-model holds texts by a 2026 model: `train/` for training and `test/` for the
// test only. The script splits each other source by file into a training part and a test part, so the test
// texts are new to the model.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [dataDir, gutenbergDir] = process.argv.slice(2);
const newerDir = 'scripts/ai-detector-data/newer-model';
if (!dataDir) {
  console.error('Usage: node scripts/train-ai-detector.mjs <ghostbuster-data> <gutenberg>');
  process.exit(2);
}

// Compile the feature code to CommonJS, so this script runs the same code as the app.
const out = mkdtempSync(join(tmpdir(), 'vlo-ai-'));
execFileSync(
  'npx',
  [
    'tsc',
    'src/features/analysis/ai/features.ts',
    '--outDir',
    out,
    '--module',
    'commonjs',
    '--target',
    'es2022',
    '--lib',
    'es2023',
    '--moduleResolution',
    'node',
    '--skipLibCheck',
    '--strict',
    '--ignoreConfig',
    '--ignoreDeprecations',
    '6.0',
  ],
  { stdio: 'inherit' },
);
const require = createRequire(import.meta.url);
const { featureInput, featuresOf, windowOf, FEATURE_NAMES, MIN_WORDS } = require(
  join(out, 'ai', 'features.js'),
);

/** A stable split: about 1 file in 4 goes to the test part. */
const isTest = (name) => createHash('sha1').update(name).digest()[0] < 64;

function readFolder(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => ({ name, text: readFileSync(join(folder, name), 'utf8') }));
}

const docs = [];
const add = (source, label, folder) => {
  for (const { name, text } of readFolder(folder))
    docs.push({ source, label, id: `${source}/${name}`, text });
};
for (const domain of ['wp', 'essay']) {
  add(`${domain}/human`, 0, join(dataDir, domain, 'human'));
  for (const kind of ['gpt', 'claude', 'gpt_prompt1', 'gpt_prompt2', 'gpt_writing', 'gpt_semantic'])
    add(`${domain}/${kind}`, 1, join(dataDir, domain, kind));
}
for (const learner of ['toefl91', 'lang8', 'pelic', 'ets', 'bawe'])
  add(`learner/${learner}`, 0, join(dataDir, 'other', learner));
add('other/undetectable', 1, join(dataDir, 'other', 'undetectable'));
if (gutenbergDir) {
  // Published fiction, cut into passages of about 250 words at paragraph breaks.
  const books = readdirSync(gutenbergDir).filter((name) =>
    /^(austen|chesterton|melville|carroll|edgeworth|bryant|burgess)-.*\.txt$/.test(name),
  );
  for (const book of books) {
    const paragraphs = readFileSync(join(gutenbergDir, book), 'utf8')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter((p) => p.length > 0 && !/^(CHAPTER|VOLUME|\[)/i.test(p));
    let passage = [];
    let words = 0;
    let index = 0;
    for (const paragraph of paragraphs) {
      passage.push(paragraph);
      words += paragraph.split(/\s+/).length;
      if (words >= 250) {
        if (index % 3 === 0)
          docs.push({
            source: 'fiction/gutenberg',
            label: 0,
            id: `gutenberg/${book}/${index}`,
            text: passage.join('\n\n'),
          });
        index += 1;
        passage = [];
        words = 0;
      }
    }
  }
}
// Newer-model texts: the training ones all go to the training part, so the model learns their style too.
add('newer/test', 1, join(newerDir, 'test'));
add('newer/train', 1, join(newerDir, 'train'));

// The undetectable.ai texts and the newer-model texts test the model only. They show how it does on
// text that a paraphrasing tool changed, and on models that the training data does not have.
const testOnly = (source) => source === 'other/undetectable' || source === 'newer/test';

/** Samples: each whole text, and windows of 4 to 14 sentences, as the report scores. */
function samplesOf(doc, rand) {
  const input = featureInput(doc.text);
  const found = [];
  const whole = featuresOf(input, lexicon);
  if (whole) found.push({ x: whole, kind: 'whole' });
  const n = input.sentences.length;
  for (let start = 0; start < n;) {
    const size = 4 + Math.floor(rand() * 11);
    const x = featuresOf(windowOf(input, start, Math.min(n, start + size)), lexicon);
    if (x) found.push({ x, kind: 'window' });
    start += size;
  }
  return found;
}

// The lexicon: words that the training texts of one label use more, by document frequency, with
// add-5 smoothing. Each word must appear in at least 30 training texts. Only the sources where human and
// AI texts answer the same prompts count, so a topic or a regional spelling (such as British "colour" in
// the learner essays) does not become a sign.
const trainDocs = docs.filter(
  (doc) =>
    !testOnly(doc.source) &&
    !isTest(doc.id) &&
    (doc.source.startsWith('wp/') || doc.source.startsWith('essay/')),
);
const docFreq = [new Map(), new Map()];
const labelDocs = [0, 0];
for (const doc of trainDocs) {
  labelDocs[doc.label] += 1;
  const seen = new Set(featureInput(doc.text).sentences.flatMap((s) => s.words.map((w) => w.lower)));
  for (const word of seen) docFreq[doc.label].set(word, (docFreq[doc.label].get(word) ?? 0) + 1);
}
const lexiconEntries = [];
for (const word of new Set([...docFreq[0].keys(), ...docFreq[1].keys()])) {
  const h = docFreq[0].get(word) ?? 0;
  const a = docFreq[1].get(word) ?? 0;
  if (h + a < 30 || /[\d.]/.test(word) || word.length < 2) continue;
  const odds = Math.log((a + 5) / (labelDocs[1] + 10) / ((h + 5) / (labelDocs[0] + 10)));
  if (Math.abs(odds) >= 0.7)
    lexiconEntries.push([word, Math.round(Math.max(-3, Math.min(3, odds)) * 100) / 100]);
}
lexiconEntries.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
const LEXICON_SIZE = Number(process.env.LEXICON ?? 1500);
const lexiconList = lexiconEntries.slice(0, LEXICON_SIZE).sort((x, y) => (x[0] < y[0] ? -1 : 1));
const lexicon = new Map(lexiconList);
console.log(
  `lexicon: ${lexicon.size} words, e.g. AI: ${lexiconEntries
    .filter((e) => e[1] > 0)
    .slice(0, 25)
    .map((e) => e[0])
    .join(' ')}`,
);
console.log(
  `  human: ${lexiconEntries
    .filter((e) => e[1] < 0)
    .slice(0, 25)
    .map((e) => e[0])
    .join(' ')}`,
);

let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const train = [];
const test = [];
for (const doc of docs) {
  const target = testOnly(doc.source) || (isTest(doc.id) && doc.source !== 'newer/train') ? test : train;
  for (const sample of samplesOf(doc, rand))
    target.push({ ...sample, y: doc.label, source: doc.source, id: doc.id });
}
console.log(`${docs.length} texts, ${train.length} training samples, ${test.length} test samples`);

// Standardize each feature with a log-like squash for long tails.
const d = FEATURE_NAMES.length;
const squash = (v) => Math.sign(v) * Math.log1p(Math.abs(v));
const means = new Array(d).fill(0);
const scales = new Array(d).fill(0);
for (const s of train) s.x.forEach((v, j) => (means[j] += squash(v)));
for (let j = 0; j < d; j += 1) means[j] /= train.length;
for (const s of train) s.x.forEach((v, j) => (scales[j] += (squash(v) - means[j]) ** 2));
for (let j = 0; j < d; j += 1) scales[j] = Math.sqrt(scales[j] / train.length) || 1;
const z = (x) => x.map((v, j) => Math.max(-6, Math.min(6, (squash(v) - means[j]) / scales[j])));
for (const s of [...train, ...test]) s.z = z(s.x);

// Weights: each label counts the same, and within a label each source counts the same, so the many
// learner essays do not crowd out the native writers, whose style is closest to AI text.
const perSource = new Map();
for (const s of train) perSource.set(s.source, (perSource.get(s.source) ?? 0) + 1);
const sourcesOf = [new Set(), new Set()];
for (const s of train) sourcesOf[s.y].add(s.source);
for (const s of train) s.w = train.length / (2 * sourcesOf[s.y].size * perSource.get(s.source));

// A model with one hidden layer of 16 units (tanh), fitted with Adam and L2. Small enough to ship as code.
const H = Number(process.env.HIDDEN ?? 16);
const L2 = Number(process.env.L2 ?? 1e-3);
let w1 = Array.from({ length: H }, () => Array.from({ length: d }, () => (rand() - 0.5) * 0.2));
let b1 = new Array(H).fill(0);
let w2 = Array.from({ length: H }, () => (rand() - 0.5) * 0.2);
let b2 = 0;

function forward(zv) {
  const h = new Array(H);
  for (let k = 0; k < H; k += 1) {
    let a = b1[k];
    const row = w1[k];
    for (let j = 0; j < d; j += 1) a += row[j] * zv[j];
    h[k] = Math.tanh(a);
  }
  let o = b2;
  for (let k = 0; k < H; k += 1) o += w2[k] * h[k];
  return { h, o };
}

const params = () => [w1.flat(), b1, w2, [b2]].flat();
const P = H * d + H + H + 1;
const m = new Float64Array(P);
const v = new Float64Array(P);
let step = 0;
const lr = 0.003;
const epochs = Number(process.env.EPOCHS ?? 12);
const batch = 64;
for (let epoch = 0; epoch < epochs; epoch += 1) {
  for (let i = train.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [train[i], train[j]] = [train[j], train[i]];
  }
  let loss = 0;
  for (let start = 0; start < train.length; start += batch) {
    const grad = new Float64Array(P);
    const part = train.slice(start, start + batch);
    for (const s of part) {
      const { h, o } = forward(s.z);
      const p = 1 / (1 + Math.exp(-o));
      loss += -s.w * (s.y ? Math.log(p + 1e-12) : Math.log(1 - p + 1e-12));
      const g = s.w * (p - s.y);
      for (let k = 0; k < H; k += 1) {
        grad[H * d + H + k] += g * h[k];
        const gh = g * w2[k] * (1 - h[k] * h[k]);
        grad[H * d + k] += gh;
        const base = k * d;
        for (let j = 0; j < d; j += 1) grad[base + j] += gh * s.z[j];
      }
      grad[P - 1] += g;
    }
    const flat = params();
    step += 1;
    for (let q = 0; q < P; q += 1) {
      const gq = grad[q] / part.length + (q < H * d ? L2 * flat[q] : 0);
      m[q] = 0.9 * m[q] + 0.1 * gq;
      v[q] = 0.999 * v[q] + 0.001 * gq * gq;
      const mh = m[q] / (1 - 0.9 ** step);
      const vh = v[q] / (1 - 0.999 ** step);
      flat[q] -= (lr * mh) / (Math.sqrt(vh) + 1e-8);
    }
    w1 = Array.from({ length: H }, (_, k) => flat.slice(k * d, (k + 1) * d));
    b1 = flat.slice(H * d, H * d + H);
    w2 = flat.slice(H * d + H, H * d + 2 * H);
    b2 = flat[P - 1];
  }
  console.log(`epoch ${epoch + 1}: loss ${(loss / train.length).toFixed(4)}`);
}

const score = (s) => 1 / (1 + Math.exp(-forward(s.z).o));
for (const s of test) s.p = score(s);

function auc(samples) {
  const pos = samples.filter((s) => s.y === 1).map((s) => s.p);
  const neg = samples.filter((s) => s.y === 0).map((s) => s.p);
  if (!pos.length || !neg.length) return NaN;
  const all = [...pos.map((p) => [p, 1]), ...neg.map((p) => [p, 0])].sort((a, b) => a[0] - b[0]);
  let rank = 0;
  let sum = 0;
  all.forEach(([, y], i) => {
    rank = i + 1;
    if (y) sum += rank;
  });
  return (sum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

// The thresholds for "likely AI": for each source of native human writing, the score that at most 1% of
// its whole texts (3% of its windows) in the training part reach. The model uses the highest of them.
const NATIVE = ['wp/human', 'essay/human', 'fiction/gutenberg'];
const cutFor = (kind, share) =>
  Math.max(
    ...NATIVE.map((source) => {
      const scores = train
        .filter((s) => s.y === 0 && s.kind === kind && s.source === source)
        .map(score)
        .sort((a, b) => a - b);
      return scores.length ? scores[Math.min(scores.length - 1, Math.floor(scores.length * share))] : 0;
    }),
  );
const threshold = cutFor('whole', 0.99);
const windowThreshold = cutFor('window', 0.97);
// Below this score, at least 90% of native human texts score higher, so the report can say "few signs".
const looseThreshold = cutFor('whole', 0.9);

const lines = [];
const report = (label, samples, cut) => {
  const humans = samples.filter((s) => s.y === 0);
  const ais = samples.filter((s) => s.y === 1);
  const fpr = humans.length ? humans.filter((s) => s.p >= cut).length / humans.length : NaN;
  const tpr = ais.length ? ais.filter((s) => s.p >= cut).length / ais.length : NaN;
  const area = auc(samples);
  const parts = [`${label.padEnd(30)} ${String(samples.length).padStart(5)} texts`];
  if (!Number.isNaN(area)) parts.push(`AUC ${area.toFixed(3)}`);
  if (humans.length) parts.push(`human texts flagged ${(fpr * 100).toFixed(1)}%`);
  if (ais.length) parts.push(`AI texts caught ${(tpr * 100).toFixed(1)}%`);
  const line = parts.join(', ');
  lines.push(line);
  console.log(line);
};
console.log(`\nWhole texts, threshold ${threshold.toFixed(3)}:`);
const whole = test.filter((s) => s.kind === 'whole');
report(
  'all, without tool and newer',
  whole.filter((s) => !testOnly(s.source)),
  threshold,
);
for (const source of [...new Set(whole.map((s) => s.source))].sort())
  report(
    source,
    whole.filter((s) => s.source === source),
    threshold,
  );
console.log(`\nWindows of 4 to 14 sentences, threshold ${windowThreshold.toFixed(3)}:`);
const windows = test.filter((s) => s.kind === 'window');
report(
  'all windows',
  windows.filter((s) => !testOnly(s.source)),
  windowThreshold,
);
for (const source of [...new Set(windows.map((s) => s.source))].sort())
  report(
    `window ${source}`,
    windows.filter((s) => s.source === source),
    windowThreshold,
  );

// How many signs per 100 words native human writers use, so the report can say when a text has more.
const tellIndex = FEATURE_NAMES.map((name, j) => (name.startsWith('tell_') ? j : -1)).filter((j) => j >= 0);
const humanTells = train
  .filter((s) => s.y === 0 && s.kind === 'whole' && NATIVE.includes(s.source))
  .map((s) => tellIndex.reduce((sum, j) => sum + s.x[j], 0))
  .sort((a, b) => a - b);
const tellQuantiles = [0.5, 0.9, 0.99].map((q) => humanTells[Math.floor(q * (humanTells.length - 1))]);
console.log(
  `signs per 100 words in native human texts: median ${tellQuantiles[0].toFixed(2)}, 90% ${tellQuantiles[1].toFixed(2)}, 99% ${tellQuantiles[2].toFixed(2)}`,
);

const round = (x) => Number(x.toPrecision(5));
const model = {
  features: FEATURE_NAMES,
  lexicon: lexiconList,
  means: means.map(round),
  scales: scales.map(round),
  hidden: w1.map((row) => row.map(round)),
  hiddenBias: b1.map(round),
  output: w2.map(round),
  outputBias: round(b2),
  threshold: round(threshold),
  windowThreshold: round(windowThreshold),
  looseThreshold: round(looseThreshold),
  minWords: MIN_WORDS,
  humanTells: tellQuantiles.map(round),
};
const file = `/*
 * The AI writing model, made by scripts/train-ai-detector.mjs. Do not edit by hand. Test results on texts
 * that the model never saw (a flag is a score at or above the threshold):
 *
${lines.map((line) => ` *   ${line}`).join('\n')}
 */

import type { ModelData } from './modelData';

export const MODEL: ModelData = ${JSON.stringify(model)};
`;
writeFileSync('src/features/analysis/ai/model.ts', file);
console.log('\nWrote src/features/analysis/ai/model.ts');
console.log(`loose threshold ${looseThreshold.toFixed(3)}`);
if (process.env.SHOW_EXTRA)
  for (const s of test.filter((s) => s.source === 'newer/test' && s.kind === 'whole'))
    console.log(s.id, s.p.toFixed(3));

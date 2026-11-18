#!/usr/bin/env node
/*
 * Builds the thesaurus of Phase 19, Task D2 (src/features/thesaurus/thesaurus.json) from Open English
 * WordNet (CC BY 4.0, https://github.com/globalwordnet/english-wordnet). The file holds each sense once:
 * its part of speech, a short definition and its words. Each word lists its senses in WordNet's order, which
 * puts the most frequent sense first, and the antonyms of each sense. An adjective's sense also takes the
 * words of the senses that WordNet calls similar, as a printed thesaurus does. Ethnic slurs are left out. A word
 * whose most frequent sense WordNet marks as obscene stays in the thesaurus, and the file lists it, so the
 * rhymes leave it out.
 *
 * Usage: node scripts/build-thesaurus.mjs <english-wordnet-2024.xml.gz>
 * The file comes from https://en-word.net/static/english-wordnet-2024.xml.gz.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [source] = process.argv.slice(2);
if (!source) {
  console.error('Usage: node scripts/build-thesaurus.mjs <english-wordnet-2024.xml.gz>');
  process.exit(1);
}

/** The longest definition, in characters. A longer one ends at its first clause or a word. */
const MAX_DEFINITION = 90;
/** The most words that one sense lists. */
const MAX_WORDS = 14;

const xml = gunzipSync(readFileSync(source)).toString('utf8');
const unescape = (text) =>
  text
    .replace(/&apos;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const attr = (line, name) => {
  const found = new RegExp(`\\s${name}="([^"]*)"`).exec(line);
  return found ? unescape(found[1]) : null;
};

/** Entry id to its lemma. */
const lemmas = new Map();
/** Sense id to its lemma. */
const senseLemma = new Map();
/** Each lemma's senses in order: the synset id, the antonym sense ids, and whether it starts a part of speech. */
const entrySenses = new Map();
/** Synset id to its part of speech, definition, member entries, similar synsets and usage. */
const synsets = new Map();

let entry = null;
let sense = null;
let synset = null;
for (const line of xml.split('\n')) {
  if (line.includes('<LexicalEntry ')) entry = { id: attr(line, 'id') };
  else if (entry && line.includes('<Lemma ')) {
    entry.lemma = attr(line, 'writtenForm');
    lemmas.set(entry.id, entry.lemma);
  } else if (entry && line.includes('<Sense ')) {
    sense = { id: attr(line, 'id'), synset: attr(line, 'synset'), antonyms: [], first: !entry.seen };
    entry.seen = true;
    senseLemma.set(sense.id, entry.lemma);
    const list = entrySenses.get(entry.lemma) ?? [];
    list.push(sense);
    entrySenses.set(entry.lemma, list);
    if (line.trim().endsWith('/>')) sense = null;
  } else if (sense && line.includes('<SenseRelation ') && attr(line, 'relType') === 'antonym')
    sense.antonyms.push(attr(line, 'target'));
  else if (line.includes('</Sense>')) sense = null;
  else if (line.includes('</LexicalEntry>')) entry = null;
  else if (line.includes('<Synset ')) {
    synset = {
      id: attr(line, 'id'),
      pos: attr(line, 'partOfSpeech'),
      members: (attr(line, 'members') ?? '').split(' ').filter(Boolean),
      similar: [],
      usage: [],
      definition: '',
    };
    synsets.set(synset.id, synset);
  } else if (synset && line.includes('<Definition>') && synset.definition === '')
    synset.definition = unescape(line.replace(/.*<Definition>|<\/Definition>.*/g, '').trim());
  else if (synset && line.includes('<SynsetRelation ') && attr(line, 'relType') === 'similar')
    synset.similar.push(attr(line, 'target'));
  else if (synset && line.includes('<SynsetRelation ') && attr(line, 'relType') === 'exemplifies')
    synset.usage.push(attr(line, 'target'));
  else if (line.includes('</Synset>')) synset = null;
}

/** A short definition: the first clause, cut at a word. */
function short(definition) {
  const first = definition.split(/;\s/)[0] ?? definition;
  if (first.length <= MAX_DEFINITION) return first;
  return `${first.slice(0, first.lastIndexOf(' ', MAX_DEFINITION - 1))}…`;
}

/** WordNet's usage synsets "ethnic slur" and "obscenity". */
const SLUR = 'oewn-06731706-n';
const OBSCENE = 'oewn-07139048-n';
const memberLemmas = (id) => (synsets.get(id)?.members ?? []).map((m) => lemmas.get(m));
const slurs = new Set(
  [...synsets.values()].filter((s) => s.usage.includes(SLUR)).flatMap((s) => memberLemmas(s.id)),
);
/**
 * A word whose most frequent sense is obscene in each part of speech. "love" has such a sense too, but not
 * first, and "blame" has one only as an adjective.
 */
const rude = new Set(
  [...entrySenses]
    .filter(([, list]) =>
      list.filter((s) => s.first).every((s) => synsets.get(s.synset)?.usage.includes(OBSCENE)),
    )
    .map(([lemma]) => lemma),
);

/** The number of senses of a lemma. */
const sensesOf = (lemma) => entrySenses.get(lemma)?.length ?? 0;
/** A plain word or phrase of lower-case letters: no names such as "Venus", no numbers. */
const isWord = (lemma) => /^[a-z][a-z'’ -]*$/.test(lemma) && !slurs.has(lemma);
/** A word that the caret can sit in: one plain word, no phrase. */
const isKey = (lemma) => /^[a-z][a-z'’-]*$/.test(lemma) && !slurs.has(lemma);

const POS = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };

/** Each synset becomes one sense: [part of speech, definition, words]. */
const senseIndex = new Map();
const senses = [];
function senseOf(id) {
  if (senseIndex.has(id)) return senseIndex.get(id);
  const found = synsets.get(id);
  const own = found.members.map((m) => lemmas.get(m));
  // Similar words come after the sense's own words, the most common first. A word with more senses is
  // usually more common, so "brilliant" comes before "nitid".
  const near =
    found.pos === 'a' || found.pos === 's'
      ? found.similar
          .flatMap((s) => synsets.get(s)?.members ?? [])
          .map((m) => lemmas.get(m))
          .filter(Boolean)
          .sort((a, b) => sensesOf(b) - sensesOf(a))
      : [];
  const unique = [...new Set([...own, ...near].filter(Boolean))].filter(isWord).slice(0, MAX_WORDS + 1);
  const index = senses.length;
  senses.push([POS[found.pos] ?? 'noun', short(found.definition), unique]);
  senseIndex.set(id, index);
  return index;
}

/** Each word: [[sense, antonyms], ...]. A sense with no other word and no antonym is left out. */
const words = Object.create(null);
for (const [lemma, list] of [...entrySenses].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
  if (!isKey(lemma)) continue;
  const rows = [];
  for (const s of list) {
    if (synsets.get(s.synset)?.usage.includes(SLUR)) continue;
    const index = senseOf(s.synset);
    const antonyms = [...new Set(s.antonyms.map((a) => senseLemma.get(a)).filter((a) => a && isWord(a)))];
    const others = senses[index][2].filter((w) => w !== lemma);
    if (others.length > 0 || antonyms.length > 0)
      rows.push(antonyms.length > 0 ? [index, antonyms] : [index]);
  }
  if (rows.length === 0) continue;
  // WordNet orders the senses within each part of speech. The part of speech with the most senses, which
  // is usually the most common use, comes first, as in a printed thesaurus.
  const count = (pos) => rows.filter((r) => senses[r[0]][0] === pos).length;
  const order = [...new Set(rows.map((r) => senses[r[0]][0]))].sort((a, b) => count(b) - count(a));
  words[lemma] = order.flatMap((pos) => rows.filter((r) => senses[r[0]][0] === pos));
}

// Only the senses that a word lists stay, under new numbers.
const used = [...new Set(Object.values(words).flatMap((rows) => rows.map((r) => r[0])))].sort(
  (a, b) => a - b,
);
const renumber = new Map(used.map((old, i) => [old, i]));
for (const rows of Object.values(words)) for (const row of rows) row[0] = renumber.get(row[0]);
const out = {
  credit: 'Open English WordNet 2024, CC BY 4.0, https://en-word.net',
  senses: used.map((i) => senses[i]),
  words,
  rude: [...rude].filter((w) => w in words).sort(),
};
const target = new URL('../src/features/thesaurus/thesaurus.json', import.meta.url);
writeFileSync(target, JSON.stringify(out));
console.log(`${String(Object.keys(words).length)} words, ${String(used.length)} senses`);

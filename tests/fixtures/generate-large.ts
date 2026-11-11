import { generateKeyBetween } from 'fractional-indexing';
import type { Item, ItemKind, Project } from '@/lib/db';
import { countLines, countWords } from '@/lib/wordcount';

/*
 * Builds the 100,000-word project for the performance budgets (VLO_SPEC sections 12 and 15), or one of
 * another size, such as the 200,000-word project of the release checks (roadmap 2 F70). The same seed and
 * size always give the same project. Every generated word is plain lowercase letters, so each one counts as one
 * word. The binder rules let a writer put poems only in a poetry collection. This project holds both kinds
 * on purpose, so one project covers both editors at full size.
 */

export const LARGE_TOTAL_WORDS = 100_000;
export const LARGE_LONG_SCENE_WORDS = 10_000;
export const LARGE_CHAPTERS = 40;
export const LARGE_SCENES = 120;
export const LARGE_POEMS = 30;

const WORDS = (
  'salt tide porch light board kettle harbour gull rope anchor lantern window door stair attic cellar ' +
  'garden hedge orchard river bridge ferry dock pier shore cliff stone pebble shell sand wave current ' +
  'storm rain fog mist frost snow ice wind breeze gale thunder cloud morning evening night noon dusk ' +
  'dawn winter summer autumn spring letter ink paper page pen desk chair table lamp candle match ' +
  'smoke ash fire hearth bread salt butter honey apple pear plum cherry tea coffee milk sugar cup ' +
  'plate spoon knife fork bowl jar bottle basket coat scarf boot glove hat shawl ribbon button thread ' +
  'needle cloth wool linen silk mother father sister brother aunt uncle cousin friend neighbour stranger ' +
  'keeper sailor baker teacher doctor child woman man dog cat horse sparrow heron crow owl fox deer ' +
  'walk run climb wait watch listen remember forget carry hold open close turn lean keep leave return ' +
  'follow answer whisper laugh weep sing write read count mend sweep fold pour wake sleep dream ' +
  'quiet slow late early soft warm cold bright dim narrow wide old new small long short heavy light ' +
  'green grey blue white black red amber silver brown pale deep still empty full near far always ' +
  'never again almost only even once twice together alone between under over toward beside behind ' +
  'through across along against the a an and but or of in on at to from with by for as if when'
).split(' ');

/** Mulberry32: a small seeded random number source. Returns numbers in [0, 1). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class TextMaker {
  constructor(private readonly random: () => number) {}

  between(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }

  word(): string {
    return WORDS[Math.floor(this.random() * WORDS.length)] ?? 'salt';
  }

  words(count: number): string[] {
    return Array.from({ length: count }, () => this.word());
  }

  /** Prose of exactly `count` words: sentences of 6 to 18 words, paragraphs of 40 to 120 words. */
  prose(count: number): string {
    const paragraphs: string[] = [];
    let left = count;
    while (left > 0) {
      let inParagraph = Math.min(left, this.between(40, 120));
      left -= inParagraph;
      const sentences: string[] = [];
      while (inParagraph > 0) {
        const size = Math.min(inParagraph, this.between(6, 18));
        inParagraph -= size;
        const [first = 'salt', ...rest] = this.words(size);
        sentences.push(`${first.charAt(0).toUpperCase()}${first.slice(1)}${rest.map((w) => ` ${w}`).join('')}.`);
      }
      paragraphs.push(sentences.join(' '));
    }
    return paragraphs.join('\n\n');
  }

  /** A poem of 3 to 5 stanzas, with leading and internal runs of spaces like the poem fixture. */
  poem(): string {
    const stanzas: string[] = [];
    const stanzaCount = this.between(3, 5);
    for (let s = 0; s < stanzaCount; s += 1) {
      const lines: string[] = [];
      const lineCount = this.between(3, 6);
      for (let l = 0; l < lineCount; l += 1) {
        const indent = ' '.repeat(4 * this.between(0, 3));
        const gap = this.random() < 0.2 ? '    ' : ' ';
        lines.push(indent + this.words(this.between(3, 8)).join(gap));
      }
      stanzas.push(lines.join('\n'));
    }
    return stanzas.join('\n\n');
  }
}

export interface LargeProject {
  project: Project;
  items: Item[];
  /** Plain text of each item that holds text, by item id. */
  texts: Map<string, string>;
}

export function generateLargeProject(seed: number, totalWords = LARGE_TOTAL_WORDS): LargeProject {
  const random = seededRandom(seed);
  const make = new TextMaker(random);
  const createdAt = Date.UTC(2026, 0, 1);
  // The 100,000-word project keeps its first id, so its tests and their logs stay the same.
  const projectId = totalWords === LARGE_TOTAL_WORDS ? `large-${String(seed)}` : `large-${String(seed)}-${String(totalWords)}`;
  let serial = 0;
  const items: Item[] = [];
  const texts = new Map<string, string>();
  const lastOrder = new Map<string | null, string | null>();

  const add = (kind: ItemKind, title: string, parentId: string | null, text?: string): Item => {
    serial += 1;
    const order = generateKeyBetween(lastOrder.get(parentId) ?? null, null);
    lastOrder.set(parentId, order);
    const item: Item = {
      id: `${projectId}-${String(serial).padStart(3, '0')}`,
      projectId,
      parentId,
      kind,
      title,
      status: 'draft',
      order,
      wordCount: text === undefined ? 0 : countWords(text),
      createdAt: createdAt + serial,
      updatedAt: createdAt + serial,
      ...(kind === 'poem' && text !== undefined ? { lineCount: countLines(text) } : {}),
    };
    items.push(item);
    if (text !== undefined) texts.set(item.id, text);
    return item;
  };

  // Poems first, so the scenes can share out whatever words are left.
  const poems = Array.from({ length: LARGE_POEMS }, () => make.poem());
  const poemWords = poems.reduce((sum, poem) => sum + countWords(poem), 0);

  const shortScenes = LARGE_SCENES - 1;
  const shortTotal = totalWords - LARGE_LONG_SCENE_WORDS - poemWords;
  const weights = Array.from({ length: shortScenes }, () => 0.6 + random() * 0.8);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const sizes = weights.map((w) => Math.floor((w / weightSum) * shortTotal));
  sizes[sizes.length - 1] = (sizes.at(-1) ?? 0) + shortTotal - sizes.reduce((a, b) => a + b, 0);

  // The long scene sits in the middle of the book, so opening it is not the default first item.
  const longChapter = LARGE_CHAPTERS / 2;
  const scenesPerChapter = LARGE_SCENES / LARGE_CHAPTERS;
  let shortIndex = 0;
  for (let c = 1; c <= LARGE_CHAPTERS; c += 1) {
    const chapter = add('chapter', `Chapter ${String(c)}`, null);
    for (let s = 1; s <= scenesPerChapter; s += 1) {
      const long = c === longChapter && s === 2;
      const size = long ? LARGE_LONG_SCENE_WORDS : (sizes[shortIndex++] ?? 0);
      add('scene', `Scene ${String(c)}.${String(s)}`, chapter.id, make.prose(size));
    }
  }
  const section = add('part', 'Poems', null);
  poems.forEach((poem, i) => {
    add('poem', `Poem ${String(i + 1)}`, section.id, poem);
  });

  const project: Project = {
    id: projectId,
    title: `${(totalWords / 1000).toLocaleString('en-US')} thousand words`,
    templates: ['novel'],
    aiMode: 'pen',
    createdAt,
    updatedAt: createdAt + serial,
    settings: { snapshotEveryMinutes: 10, aliasAiRequests: false, streaksEnabled: false, restDays: [] },
  };
  return { project, items, texts };
}

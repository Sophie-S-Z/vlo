import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { parseBibtex } from '@/features/cite/sources';
import { buildExportDoc } from '@/features/export/build';
import { toEpub, type EpubOptions } from '@/features/export/epub';
import { prepareExport } from '@/features/export/run';
import type { Source } from '@/lib/db';
import { generateLargeProject } from '../fixtures/generate-large';
import {
  BOOK,
  bookMemoir,
  bookNovel,
  bookPoetry,
  item,
  loadPublicFile,
  photoDoc,
  poemUpdate,
  project,
  proseUpdate,
  RICH_PROSE,
  scriptUpdate,
  singleDoc,
  updateOf,
} from './export-fixtures';

/*
 * Roadmap 2 F70, plan Task O1: EPUBCheck reads each EPUB that the tests make, as a store does, and finds no
 * error. CI runs it in the export job, with the EPUBCheck release pinned by its SHA-256.
 */

const jar = process.env.EPUBCHECK_JAR ?? '';
if (process.env.VLO_REQUIRE_EPUBCHECK === '1' && jar === '') {
  throw new Error('This run needs EPUBCheck: set EPUBCHECK_JAR to the path of epubcheck.jar.');
}

const options: EpubOptions = {
  loadFile: loadPublicFile,
  id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
  modified: new Date('2026-11-11T10:00:00Z'),
};

const dir = mkdtempSync(join(tmpdir(), 'vlo-epubcheck-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The errors that EPUBCheck finds in an EPUB. */
function epubErrors(name: string, bytes: Uint8Array): string[] {
  const path = join(dir, `${name}.epub`);
  const report = join(dir, `${name}.json`);
  writeFileSync(path, bytes);
  try {
    execFileSync('java', ['-jar', jar, path, '--json', report], { stdio: 'ignore' });
  } catch {
    // EPUBCheck exits with 1 when it finds an error. The report names each one.
  }
  const { messages } = JSON.parse(readFileSync(report, 'utf8')) as {
    messages: { severity: string; message: string }[];
  };
  return messages.filter((m) => m.severity === 'ERROR' || m.severity === 'FATAL').map((m) => m.message);
}

/** A text with an own font that may go in the book, and one that a stand-in replaces. */
async function ownFonts(): Promise<Uint8Array> {
  const font = (text: string, name: string) => ({
    type: 'text',
    text,
    marks: [{ type: 'textStyle', attrs: { font: `local:${name}` } }],
  });
  const doc = singleDoc(
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [font('Mine ', 'Kalam Own'), font('locked', 'Locked')] }],
    },
    'prose',
  );
  const own = new Map([['local:Kalam Own', await loadPublicFile('fonts/kalam/regular.ttf')]]);
  return (await toEpub(doc, { ...options, own, swaps: new Map([['local:Locked', 'caveat']]) })).bytes;
}

/** An essay with citations and its reference list (F64). */
function cited() {
  const sources: Source[] = parseBibtex(readFileSync('tests/fixtures/sources/zotero.bib', 'utf8')).map(
    (draft, i) => ({ ...draft, id: `s${String(i)}`, projectId: 'p1', key: `k${String(i)}` }),
  );
  const cite = (key: string, page = '') => ({ type: 'cite', attrs: { key, page } });
  const text = { type: 'text', text: 'The crossing took a night ' };
  const json = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [text, cite('k0', '12'), cite('k2')] }],
  };
  return prepareExport({
    project: project('open', { settings: { citeStyle: 'chicago' } }),
    items: [item('a', 'page', 'Essay')],
    scope: { kind: 'project' },
    updates: [['a', updateOf(json, 'prose')]],
    format: 'epub',
    people: [],
    shareSafe: false,
    sources,
  }).doc;
}

/** The 200,000-word project as a book, with its chapters and scenes. */
function longBook() {
  const large = generateLargeProject(1, 200_000);
  const items = large.items.filter((i) => i.kind === 'chapter' || i.kind === 'scene');
  const updates = new Map(
    items.flatMap((i) => {
      const text = large.texts.get(i.id);
      return text === undefined ? [] : [[i.id, proseUpdate(text.split(/\n{2,}/))] as const];
    }),
  );
  return buildExportDoc({ project: large.project, items, scope: { kind: 'project' }, updates, book: BOOK });
}

const EPUBS: [string, () => Promise<Uint8Array>][] = [
  ['rich text', async () => (await toEpub(singleDoc(RICH_PROSE, 'prose'), options)).bytes],
  [
    'poem',
    async () => {
      const doc = buildExportDoc({
        project: project('poetry'),
        items: [item('p1', 'poem', 'Salt on the Sill')],
        scope: { kind: 'item', itemId: 'p1' },
        updates: new Map([['p1', poemUpdate()]]),
      });
      return (await toEpub(doc, options)).bytes;
    },
  ],
  ['own fonts', ownFonts],
  ['novel book', async () => (await toEpub(bookNovel(), options)).bytes],
  ['memoir book', async () => (await toEpub(bookMemoir(), options)).bytes],
  ['poetry book', async () => (await toEpub(bookPoetry(), options)).bytes],
  [
    'script',
    async () => {
      const doc = buildExportDoc({
        project: project('script'),
        items: [item('x1', 'script', 'Pilot')],
        scope: { kind: 'project' },
        updates: new Map([
          [
            'x1',
            scriptUpdate([
              ['heading', 'INT. LIGHTHOUSE - NIGHT'],
              ['action', 'The lamp turns.'],
              ['character', 'MIRA'],
              ['parenthetical', 'quietly'],
              ['dialogue', 'It still works.'],
              ['transition', 'CUT TO:'],
            ]),
          ],
        ]),
      });
      return (await toEpub(doc, options)).bytes;
    },
  ],
  ['citations', async () => (await toEpub(cited(), options)).bytes],
  ['images', async () => (await toEpub(photoDoc(), options)).bytes],
  ['200,000-word book', async () => (await toEpub(longBook(), options)).bytes],
];

describe.runIf(jar !== '')('EPUBCheck', () => {
  test.each(EPUBS)(
    'the %s EPUB has no errors',
    async (name, make) => {
      expect(epubErrors(name.replace(/\W+/g, '-'), await make())).toEqual([]);
    },
    180_000,
  );
});

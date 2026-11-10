import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, describe, expect, test } from 'vitest';
import { DEFAULT_BOOK } from '@/features/book/book';
import { buildExportDoc } from '@/features/export/build';
import { epubPreview, toEpub, type EpubOptions } from '@/features/export/epub';
import type { ExportDoc } from '@/features/export/model';
import type { BookSettings } from '@/lib/db';
import { item, loadPublicFile, MEMOIR_TEXT, poemUpdate, project, proseUpdate } from './export-fixtures';

/*
 * Book EPUBs (roadmap F51, plan Task J6). The front and back matter are files of their own with their
 * `epub:type`. CI runs EPUBCheck on a novel, a memoir and a poetry book: Review Focus 5 asks for 0 errors.
 */

const jar = process.env.EPUBCHECK_JAR ?? '';
if (process.env.VLO_REQUIRE_EPUBCHECK === '1' && jar === '') {
  throw new Error('This run needs EPUBCheck: set EPUBCHECK_JAR to the path of epubcheck.jar.');
}

const options: EpubOptions = {
  loadFile: loadPublicFile,
  id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
  modified: new Date('2026-11-10T10:00:00Z'),
};

const BOOK: BookSettings = {
  ...DEFAULT_BOOK,
  copyright: 'Copyright © 2026 Ada Marlow\nAll rights reserved.',
  dedication: 'For the keepers of the light.',
  epigraph: 'The sea keeps every secret it is told.',
  acknowledgments: 'Thanks to the harbor.',
  about: 'Ada Marlow lives by the sea.',
};

function novel(book: BookSettings = BOOK): ExportDoc {
  return buildExportDoc({
    project: project('novel', { authorName: 'Ada Marlow' }),
    items: [
      item('c1', 'chapter', 'The Harbor'),
      item('s1', 'scene', 'Arrival', 'c1'),
      item('s2', 'scene', 'Later', 'c1'),
      item('c2', 'chapter', 'Chapter Two'),
      item('s3', 'scene', 'Night', 'c2'),
    ],
    scope: { kind: 'project' },
    updates: new Map([
      ['s1', proseUpdate(['The harbor lights came on.', 'The boats came in.'])],
      ['s2', proseUpdate(['The gulls slept.'])],
      ['s3', proseUpdate(['The tide turned.'])],
    ]),
    book,
  });
}

function memoir(): ExportDoc {
  return buildExportDoc({
    project: project('memoir', { authorName: 'Ada Marlow' }),
    items: [item('m1', 'memory', 'The Kettle'), item('m2', 'memory', 'The Porch')],
    scope: { kind: 'project' },
    updates: new Map([
      ['m1', proseUpdate(MEMOIR_TEXT.split(/\n{2,}/).slice(0, 6))],
      ['m2', proseUpdate(['The porch light stayed on all night.'])],
    ]),
    book: BOOK,
  });
}

function poetry(): ExportDoc {
  return buildExportDoc({
    project: project('poetry', { authorName: 'Ada Marlow' }),
    items: [item('p1', 'poem', 'Salt on the Sill'), item('p2', 'poem', 'Low Tide')],
    scope: { kind: 'project' },
    updates: new Map([
      ['p1', poemUpdate()],
      ['p2', poemUpdate('The water goes out\n    and leaves its lines.')],
    ]),
    book: { ...BOOK, sceneBreak: 'fleuron' },
  });
}

async function read(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const text = async (path: string) => (await zip.file(path)?.async('string')) ?? '';
  return { zip, text, opf: await text('OEBPS/content.opf') };
}

describe('book EPUB', () => {
  test('the front and back matter are their own files, each with its epub:type, in book order', async () => {
    const book = await read((await toEpub(novel(), options)).bytes);
    const spine = [...book.opf.matchAll(/<itemref idref="([^"]+)"/g)].map((m) => m[1]);
    expect(spine).toEqual([
      'title',
      'copyright',
      'dedication',
      'epigraph',
      'nav',
      'part-1',
      'part-2',
      'acknowledgments',
      'about',
    ]);
    expect(await book.text('OEBPS/text/copyright.xhtml')).toContain(
      '<section class="matter copyright" epub:type="copyright-page">',
    );
    expect(await book.text('OEBPS/text/dedication.xhtml')).toContain('epub:type="dedication"');
    expect(await book.text('OEBPS/text/epigraph.xhtml')).toContain('epub:type="epigraph"');
    const thanks = await book.text('OEBPS/text/acknowledgments.xhtml');
    expect(thanks).toContain('<body epub:type="backmatter">');
    expect(thanks).toContain('epub:type="acknowledgments"');
    expect(thanks).toContain('<h2>Acknowledgments</h2>');
  });

  test('the contents lists the chapters and the back matter', async () => {
    const book = await read((await toEpub(novel(), options)).bytes);
    const nav = await book.text('OEBPS/nav.xhtml');
    const titles = [...nav.matchAll(/<a href="[^"]+">([^<]+)<\/a>/g)].map((m) => m[1]);
    expect(titles).toEqual(['Salt Year', 'The Harbor', 'Chapter Two', 'Acknowledgments', 'About the author']);
    // With the contents page off, the nav stays out of the reading order.
    const off = await read((await toEpub(novel({ ...BOOK, contents: false }), options)).bytes);
    expect(off.opf).not.toContain('<itemref idref="nav"/>');
  });

  test('chapters get their number and drop cap, and the CSS holds the chapter and scene break styles', async () => {
    const book = await read((await toEpub(novel(), options)).bytes);
    const first = await book.text('OEBPS/text/part-1.xhtml');
    expect(first).toContain('<p class="chapter-number">1</p>');
    expect(first).toContain(
      '<p class="has-drop-cap"><span class="drop-cap">T</span>he harbor lights came on.</p>',
    );
    expect(first).toContain('<p class="scene-break" role="separator">* * *</p>');
    // "Chapter Two" names itself, so it gets no number.
    expect(await book.text('OEBPS/text/part-2.xhtml')).not.toContain('chapter-number');
    const css = await book.text('OEBPS/styles.css');
    expect(css).toContain('font-weight: normal');
    expect(css).toContain('p + p { text-indent: 1.5em; }');
    const modern = await read((await toEpub(novel({ ...BOOK, chapter: 'modern' }), options)).bytes);
    expect(await modern.text('OEBPS/styles.css')).toContain('font-size: 3.2em');
  });

  test('the e-reader preview is the same XHTML and CSS in one page, with fonts from the app', async () => {
    const html = await epubPreview(novel(), 'https://vlo.test/');
    expect(html).toContain('For the keepers of the light.');
    expect(html).toContain('<p class="chapter-number">1</p>');
    expect(html).toContain('url("https://vlo.test/fonts/newsreader/regular.ttf")');
    expect(html).not.toContain('<script');
  });
});

const dir = mkdtempSync(join(tmpdir(), 'vlo-epubcheck-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Message {
  severity: string;
  message: string;
}

describe.runIf(jar !== '')('EPUBCheck', () => {
  test.each([
    ['novel', novel],
    ['memoir', memoir],
    ['poetry', poetry],
  ] as const)(
    'the %s book has no errors',
    async (name, make) => {
      const path = join(dir, `${name}.epub`);
      writeFileSync(path, (await toEpub(make(), options)).bytes);
      const report = join(dir, `${name}.json`);
      try {
        execFileSync('java', ['-jar', jar, path, '--json', report], { stdio: 'ignore' });
      } catch {
        // EPUBCheck exits with 1 when it finds an error. The report names each one.
      }
      const { messages } = JSON.parse(readFileSync(report, 'utf8')) as { messages: Message[] };
      const errors = messages.filter((m) => m.severity === 'ERROR' || m.severity === 'FATAL');
      expect(errors.map((m) => m.message)).toEqual([]);
    },
    60_000,
  );
});

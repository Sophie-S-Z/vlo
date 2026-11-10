import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { bookMargins, DEFAULT_BOOK, TRIM_POINTS } from '@/features/book/book';
import { buildExportDoc } from '@/features/export/build';
import type { ExportDoc } from '@/features/export/model';
import { Drawer } from '@/features/export/pdf/draw';
import { layOutPdf, toPdf, type LaidOutPdf, type PdfOptions } from '@/features/export/pdf/pdf';
import { TRIMS, type BookSettings } from '@/lib/db';
import { generateLargeProject } from '../fixtures/generate-large';
import { item, loadPublicFile, project, proseUpdate } from './export-fixtures';

/*
 * Book layout in the PDF (roadmap F51, plan Task J4). Poppler's pdftotext reads each page as a reader
 * would. Review Focus 2: no page of the 100,000-word fixture has a widow or an orphan.
 */

const hasPoppler = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).status === 0;
if (process.env.VLO_REQUIRE_POPPLER === '1' && !hasPoppler) {
  throw new Error('This run needs Poppler (pdftotext), and it is not installed.');
}

const dir = mkdtempSync(join(tmpdir(), 'vlo-book-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

let fileCount = 0;
function save(bytes: Uint8Array): string {
  fileCount += 1;
  const path = join(dir, `book-${String(fileCount)}.pdf`);
  writeFileSync(path, bytes);
  return path;
}

interface Word {
  text: string;
  xMin: number;
  yMin: number;
}

/** The words of each page with their boxes. */
function words(path: string): Word[][] {
  const html = execFileSync('pdftotext', ['-bbox', path, '-'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return html
    .split('<page ')
    .slice(1)
    .map((page) =>
      [
        ...page.matchAll(
          /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]*)<\/word>/g,
        ),
      ].map((m) => ({ text: m[3] ?? '', xMin: Number(m[1]), yMin: Number(m[2]) })),
    );
}

/** The text of each page, in reading order. */
function pageTexts(path: string): string[] {
  return execFileSync('pdftotext', ['-layout', path, '-'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .split('\f')
    .slice(0, -1);
}

/** The page number at the foot of a page, or null. */
function folioOf(page: readonly Word[]): number | null {
  const foot = [...page].sort((a, b) => b.yMin - a.yMin)[0];
  return foot && /^\d+$/.test(foot.text) ? Number(foot.text) : null;
}

/** The left edge of the text on a page: the leftmost word. */
function leftEdge(page: readonly Word[]): number {
  return Math.min(...page.map((w) => w.xMin));
}

const options: PdfOptions = { loadFile: loadPublicFile };

const BOOK: BookSettings = {
  ...DEFAULT_BOOK,
  copyright: 'Copyright 2026 Ada Marlow.\nAll rights reserved.',
  dedication: 'For the keepers of the light.',
  epigraph: 'The sea keeps every secret it is told.',
  acknowledgments: 'Thanks to the harbor and its keepers.',
  about: 'Ada Marlow lives by the sea.',
};

const PARAGRAPHS = Array.from(
  { length: 30 },
  (_, i) =>
    `Paragraph ${String(i)}. The harbor lights came on one by one while the boats came in, and the gulls argued over the nets until the last of the light went out of the sky.`,
);

function novelDoc(book: BookSettings = BOOK): ExportDoc {
  return buildExportDoc({
    project: project('novel', { authorName: 'Ada Marlow' }),
    items: [
      item('c1', 'chapter', 'The Harbor'),
      item('s1', 'scene', 'Arrival', 'c1'),
      item('s2', 'scene', 'Dusk', 'c1'),
      item('c2', 'chapter', 'Chapter Two'),
      item('s3', 'scene', 'Night', 'c2'),
      item('c3', 'chapter', 'Night Ferry'),
      item('s4', 'scene', 'Crossing', 'c3'),
    ],
    scope: { kind: 'project' },
    updates: new Map([
      ['s1', proseUpdate(PARAGRAPHS)],
      ['s2', proseUpdate(PARAGRAPHS.slice(0, 7))],
      ['s3', proseUpdate(PARAGRAPHS.slice(0, 19))],
      ['s4', proseUpdate(PARAGRAPHS.slice(0, 4))],
    ]),
    book,
  });
}

/** The index of the first page whose text holds `text`. */
function pageWith(texts: readonly string[], text: string, from = 0): number {
  const index = texts.findIndex((t, i) => i >= from && t.includes(text));
  if (index < 0) throw new Error(`No page holds "${text}".`);
  return index;
}

describe.runIf(hasPoppler)('book PDF', () => {
  let path = '';
  let texts: string[] = [];
  let pageWords: Word[][] = [];
  beforeAll(async () => {
    path = save((await toPdf(novelDoc(), options)).bytes);
    texts = pageTexts(path);
    pageWords = words(path);
  });

  test('each trim gives its page size', async () => {
    for (const trim of TRIMS) {
      const pdf = await PDFDocument.load((await toPdf(novelDoc({ ...BOOK, trim }), options)).bytes);
      const [width, height] = TRIM_POINTS[trim];
      expect(pdf.getPage(0).getWidth()).toBeCloseTo(width, 1);
      expect(pdf.getPage(pdf.getPageCount() - 1).getHeight()).toBeCloseTo(height, 1);
      expect(pdf.getPageCount() % 2).toBe(0);
    }
  });

  test('the front matter comes in order: half title, title, copyright, dedication, epigraph, contents', () => {
    const order = [
      pageWith(texts, 'Salt Year'),
      pageWith(texts, 'Ada Marlow'),
      pageWith(texts, 'All rights reserved.'),
      pageWith(texts, 'For the keepers'),
      pageWith(texts, 'The sea keeps'),
      pageWith(texts, 'Contents'),
    ];
    // Each one starts a right-hand page, but the copyright page is the back of the title page.
    expect(order).toEqual([0, 2, 3, 4, 6, 8]);
    expect(texts[0]?.trim()).toBe('Salt Year');
    expect(texts[1]?.trim()).toBe('');
    // The copyright text sits at the foot of its page.
    const copyright = pageWords[3]?.find((w) => w.text === 'reserved.');
    expect(copyright?.yMin).toBeGreaterThan(TRIM_POINTS['5.5x8.5'][1] * 0.75);
  });

  test('each chapter starts on a right-hand page, with a blank page before it when needed', () => {
    const openings = ['The Harbor', 'Chapter Two', 'Night Ferry'].map((title) => pageWith(texts, title, 9));
    for (const index of openings) expect(index % 2).toBe(0);
    // A blank page only ever comes before a right-hand opening, or at the very end.
    const blanks = texts.flatMap((t, i) => (t.trim() === '' ? [i] : []));
    expect(blanks.length).toBeGreaterThan(3);
    for (const index of blanks) expect(index % 2 === 1 || index === texts.length - 1).toBe(true);
  });

  test('a numbered chapter has its number above its title, and "Chapter Two" names itself', () => {
    const harbor = texts[pageWith(texts, 'The Harbor', 9)] ?? '';
    expect(
      harbor
        .trim()
        .split(/\s*\n\s*/)
        .slice(0, 2),
    ).toEqual(['1', 'The Harbor']);
    const second = texts[pageWith(texts, 'Chapter Two', 9)] ?? '';
    expect(second.trim().startsWith('Chapter Two')).toBe(true);
    const ferry = texts[pageWith(texts, 'Night Ferry', 9)] ?? '';
    expect(
      ferry
        .trim()
        .split(/\s*\n\s*/)
        .slice(0, 2),
    ).toEqual(['2', 'Night Ferry']);
  });

  test('the contents page numbers match the pages where the chapters start', () => {
    const lines = (texts[8] ?? '').split('\n').flatMap((line) => {
      const m = /^\s*(\S.*?)\s{2,}(\d+)\s*$/.exec(line);
      return m ? [{ title: m[1] ?? '', folio: Number(m[2]) }] : [];
    });
    expect(lines.map((l) => l.title)).toEqual(['The Harbor', 'Chapter Two', 'Night Ferry']);
    expect(lines[0]?.folio).toBe(1);
    for (const { title, folio } of lines) {
      const index = pageWords.findIndex((page) => folioOf(page) === folio);
      expect(texts[index]).toContain(title);
    }
  });

  test('the back matter comes after the last chapter, each part on a right-hand page', () => {
    const last = pageWith(texts, 'Night Ferry', 9);
    const thanks = pageWith(texts, 'Acknowledgments', last);
    const about = pageWith(texts, 'About the author', last);
    expect(thanks).toBeGreaterThan(last);
    expect(about).toBeGreaterThan(thanks);
    expect([thanks % 2, about % 2]).toEqual([0, 0]);
  });

  test('the inside margin is on the left of odd pages and the right of even pages', () => {
    const { inside, outside } = bookMargins(texts.length);
    const body = pageWith(texts, 'The Harbor', 9);
    // The pages after an opening are full pages of text: one left-hand, one right-hand.
    expect(leftEdge(pageWords[body + 1] ?? [])).toBeCloseTo(outside, 0);
    expect(leftEdge(pageWords[body + 2] ?? [])).toBeCloseTo(inside, 0);
  });

  test('running heads give the author on the left and the title on the right, but not on an opening', () => {
    const body = pageWith(texts, 'The Harbor', 9);
    expect(texts[body + 1]?.trim().split('\n')[0]?.trim()).toBe('Ada Marlow');
    expect(texts[body + 2]?.trim().split('\n')[0]?.trim()).toBe('Salt Year');
    expect(texts[body]?.trim().split('\n')[0]?.trim()).toBe('1');
  });

  test('each scene break style draws its own mark', async () => {
    const marks = async (sceneBreak: BookSettings['sceneBreak']) => {
      const file = save((await toPdf(novelDoc({ ...BOOK, sceneBreak }), options)).bytes);
      return pageTexts(file).join('').match(/\*|❦/g) ?? [];
    };
    expect(await marks('stars')).toEqual(['*', '*', '*']);
    expect(await marks('fleuron')).toEqual(['❦']);
    expect(await marks('space')).toEqual([]);
  });

  test('a PDF with no book settings keeps its Letter pages and one-inch margins', async () => {
    const plain = { ...novelDoc() };
    delete plain.book;
    const file = save((await toPdf(plain, options)).bytes);
    const pdf = await PDFDocument.load((await toPdf(plain, options)).bytes);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    const plainTexts = pageTexts(file);
    expect(plainTexts.join('')).not.toContain('Contents');
    expect(leftEdge(words(file)[2] ?? [])).toBeCloseTo(72, 0);
  });
});

function widowsAndOrphans(laid: LaidOutPdf): string[] {
  const problems: string[] = [];
  laid.pages.forEach((page, index) => {
    const first = page.rows[0]?.row.para;
    const last = page.rows[page.rows.length - 1]?.row.para;
    if (first && first.lines > 1 && first.line === first.lines - 1)
      problems.push(`widow on ${String(index)}`);
    if (last && last.lines > 1 && last.line === 0) problems.push(`orphan on ${String(index)}`);
  });
  return problems;
}

test('a footnote on the last line of a paragraph keeps that line with the one before it', async () => {
  const text = (t: string) => ({ type: 'text', text: t, style: {} }) as const;
  const long =
    'The harbor lights came on one by one while the boats came in, and the gulls argued over the nets until the last of the light went out of the sky.';
  const problems: string[] = [];
  // Each count of short paragraphs moves the noted paragraph to another place on the page.
  for (let n = 18; n < 30; n += 1) {
    const doc: ExportDoc = {
      title: 'Notes',
      font: 'newsreader',
      paper: 'letter',
      language: 'en',
      book: { ...BOOK, contents: false, dropCaps: false },
      sections: [
        {
          id: 's',
          title: '',
          form: 'prose',
          blocks: [
            ...Array.from({ length: n }, () => ({ type: 'paragraph' as const, runs: [text('Short line.')] })),
            {
              type: 'paragraph',
              runs: [
                text(`${long} ${long}`),
                { type: 'footnote', number: 1, note: [text(`${long} ${long} ${long}`)] },
              ],
            },
            ...Array.from({ length: 10 }, () => ({ type: 'paragraph' as const, runs: [text(long)] })),
          ],
        },
      ],
    };
    const laid = await layOutPdf(doc, options, await PDFDocument.create());
    problems.push(...widowsAndOrphans(laid).map((p) => `${p} with ${String(n)} short lines`));
  }
  expect(problems).toEqual([]);
}, 60_000);

describe.runIf(hasPoppler)('a 100,000-word book', () => {
  let laid: LaidOutPdf;
  let path = '';
  beforeAll(async () => {
    const large = generateLargeProject(1);
    const items = large.items.filter((i) => i.kind === 'chapter' || i.kind === 'scene');
    const updates = new Map(
      items.flatMap((i) => {
        const text = large.texts.get(i.id);
        return text === undefined ? [] : [[i.id, proseUpdate(text.split(/\n{2,}/))] as const];
      }),
    );
    const doc = buildExportDoc({
      project: large.project,
      items,
      scope: { kind: 'project' },
      updates,
      book: BOOK,
    });
    const pdf = await PDFDocument.create();
    laid = await layOutPdf(doc, options, pdf);
    laid.pages.forEach((_, index) => {
      laid.drawPage(index, new Drawer(pdf, pdf.addPage([...laid.size])));
    });
    path = save(await pdf.save());
  }, 240_000);

  test('no page starts with the last line of a paragraph or ends with its first line', () => {
    expect(widowsAndOrphans(laid)).toEqual([]);
    expect(laid.pages.length).toBeGreaterThan(300);
  });

  test('the gutter follows the page count', () => {
    const pages = words(path);
    const { inside } = bookMargins(pages.length);
    expect(inside).toBeGreaterThan(bookMargins(100).inside);
    // A right-hand page of plain text, far from any opening.
    const index = pages.findIndex((page, i) => i > 40 && i % 2 === 0 && page.length > 200);
    expect(leftEdge(pages[index] ?? [])).toBeCloseTo(inside, 0);
  });
});

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { afterAll, describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { checkOwnFonts } from '@/features/export/fontCheck';
import type { ExportDoc } from '@/features/export/model';
import { embedProblem, evenGlyphs, maySubset, standInFor } from '@/features/export/pdf/fonts';
import { toPdf, type PdfOptions } from '@/features/export/pdf/pdf';
import {
  item,
  loadPublicFile,
  poemUpdate,
  project,
  proseUpdate,
  RICH_PROSE,
  singleDoc,
  updateOf,
  withFsType,
} from './export-fixtures';

/*
 * PDF export (spec section 9, plan Task B6). pdf-lib reads each file back. Poppler's pdftotext and
 * pdffonts read the text, the place of each word and the embedded fonts, as a PDF reader would. CI
 * installs Poppler and sets VLO_REQUIRE_POPPLER, so a missing Poppler fails there.
 */

const hasPoppler = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).status === 0;
if (process.env.VLO_REQUIRE_POPPLER === '1' && !hasPoppler) {
  throw new Error('This run needs Poppler (pdftotext and pdffonts), and it is not installed.');
}

const dir = mkdtempSync(join(tmpdir(), 'vlo-pdf-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

let fileCount = 0;
function save(bytes: Uint8Array): string {
  fileCount += 1;
  const path = join(dir, `file-${String(fileCount)}.pdf`);
  writeFileSync(path, bytes);
  return path;
}

interface Word {
  text: string;
  xMin: number;
  xMax: number;
  yMin: number;
}

/** The words of each page with their boxes, from the top of the page down. */
function words(path: string): Word[][] {
  const html = execFileSync('pdftotext', ['-bbox', path, '-'], { encoding: 'utf8' });
  return html
    .split('<page ')
    .slice(1)
    .map((page) =>
      [
        ...page.matchAll(
          /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g,
        ),
      ].map((m) => ({ text: m[4] ?? '', xMin: Number(m[1]), yMin: Number(m[2]), xMax: Number(m[3]) })),
    );
}

function pageText(path: string, page: number): string {
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-layout', path, '-'], {
    encoding: 'utf8',
  });
}

/** The embedded fonts as pdffonts lists them: the PostScript name without pdf-lib's number, and embedded. */
function fonts(path: string): { name: string; embedded: boolean }[] {
  const lines = execFileSync('pdffonts', [path], { encoding: 'utf8' }).split('\n').slice(2);
  return lines
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const cols = line.trim().split(/\s+/);
      // name, type (two words), encoding, emb, sub, uni, object id, generation.
      return { name: (cols[0] ?? '').replace(/-\d+$/, ''), embedded: cols[cols.length - 5] === 'yes' };
    });
}

/** The width of `count` spaces of a Vlo font at the text size. */
function spaces(count: number, fontId = 'newsreader'): number {
  const font = fontkit.create(readFileSync(`public/fonts/${fontId}/regular.ttf`));
  return ((font.glyphForCodePoint(32).advanceWidth * 12) / font.unitsPerEm) * count;
}

function find(list: readonly Word[], text: string, from = 0): Word {
  const word = list.slice(from).find((w) => w.text === text);
  if (!word) throw new Error(`No word "${text}" on the page.`);
  return word;
}

const options: PdfOptions = { loadFile: loadPublicFile };

function poemDoc(): ExportDoc {
  return buildExportDoc({
    project: project('poetry'),
    items: [item('p1', 'poem', 'Salt on the Sill')],
    scope: { kind: 'item', itemId: 'p1' },
    updates: new Map([['p1', poemUpdate()]]),
  });
}

function novelDoc(paragraphs = 40): ExportDoc {
  const text = Array.from(
    { length: paragraphs },
    (_, i) =>
      `Paragraph ${String(i)}. The harbor lights came on one by one while the boats came in, and the gulls argued over the nets.`,
  );
  return buildExportDoc({
    project: project('novel', { authorName: 'Ada Marlow' }),
    items: [
      item('c1', 'chapter', 'Chapter One'),
      item('s1', 'scene', 'Arrival', 'c1'),
      item('c2', 'chapter', 'Chapter Two'),
      item('s2', 'scene', 'Night', 'c2'),
    ],
    scope: { kind: 'project' },
    updates: new Map([
      ['s1', proseUpdate(text)],
      ['s2', proseUpdate(text.slice(0, 5))],
    ]),
  });
}

describe('PDF export', () => {
  test('pdf-lib reads the file back with its title, page size and pages', async () => {
    const letter = await PDFDocument.load((await toPdf(poemDoc(), options)).bytes);
    expect(letter.getTitle()).toBe('Salt on the Sill');
    expect(letter.getCreator()).toBe('Vlo');
    expect(letter.getPageCount()).toBe(1);
    expect(letter.getPage(0).getSize()).toEqual({ width: 612, height: 792 });

    const a4Doc = buildExportDoc({
      project: project('memoir', { settings: { page: 'a4' } }),
      items: [item('m', 'memory', 'Alone')],
      scope: { kind: 'project' },
      updates: new Map([['m', updateOf({ type: 'doc', content: [{ type: 'paragraph' }] }, 'prose')]]),
    });
    const a4 = await PDFDocument.load((await toPdf(a4Doc, options)).bytes);
    expect(a4.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    expect(a4.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
  });

  test('a long book flows onto numbered pages, with a title page first', async () => {
    const pdf = await PDFDocument.load((await toPdf(novelDoc(), options)).bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getAuthor()).toBe('Ada Marlow');
  });

  test('draws each gradient as a shading inside the letters, and keeps each safe link', async () => {
    const pdf = await PDFDocument.load((await toPdf(singleDoc(RICH_PROSE, 'prose'), options)).bytes);
    const page = pdf.getPage(0);
    const resources = page.node.Resources();
    const shadings = resources?.lookupMaybe(PDFName.of('Shading'), PDFDict);
    expect(shadings?.keys().length).toBe(1);
    const annots = page.node.Annots()?.asArray() ?? [];
    const uris = annots.map((ref) => {
      const annot = pdf.context.lookup(ref, PDFDict);
      const action = annot.lookup(PDFName.of('A'), PDFDict);
      return action.lookup(PDFName.of('URI'), PDFString).decodeText();
    });
    // The javascript: link of the fixture never becomes a link.
    expect(uris).toEqual(['https://example.org/a%20b']);
  });

  test('reports each font style it draws from the upright letters', async () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Carved ', marks: [{ type: 'textStyle', attrs: { font: 'cinzel' } }] },
            {
              type: 'text',
              text: 'slanted',
              marks: [{ type: 'textStyle', attrs: { font: 'cinzel' } }, { type: 'italic' }],
            },
          ],
        },
      ],
    };
    const { drawnStyles } = await toPdf(singleDoc(json, 'prose'), options);
    expect(drawnStyles).toEqual([{ font: 'Cinzel', style: 'italic' }]);
    // Newsreader has real bold and italic files, so the rich fixture draws nothing.
    expect((await toPdf(singleDoc(RICH_PROSE, 'prose'), options)).drawnStyles).toEqual([]);
  });

  test('every embedded font subset has glyph offsets that match its glyph data', async () => {
    // EB Garamond has glyphs of odd length. Short loca offsets count 2-byte words, so each glyph is padded.
    const bytes = readFileSync('public/fonts/eb-garamond/regular.ttf');
    evenGlyphs(bytes);
    const font = fontkit.create(bytes);
    const subset = font.createSubset();
    for (const glyph of font.layout('big gold quartz').glyphs) subset.includeGlyph(glyph);
    const parts: Uint8Array[] = [];
    const stream = subset.encodeStream();
    stream.on('data', (chunk: Uint8Array) => parts.push(chunk));
    await new Promise((resolve) => stream.on('end', resolve));
    const out = Buffer.concat(parts);
    const table = (tag: string) => {
      const count = out.readUInt16BE(4);
      for (let i = 0; i < count; i += 1) {
        const at = 12 + i * 16;
        if (out.toString('latin1', at, at + 4) === tag)
          return { offset: out.readUInt32BE(at + 8), length: out.readUInt32BE(at + 12) };
      }
      throw new Error(`No ${tag} table.`);
    };
    const head = table('head');
    const loca = table('loca');
    const glyf = table('glyf');
    const short = out.readInt16BE(head.offset + 50) === 0;
    const offsets = Array.from({ length: loca.length / (short ? 2 : 4) }, (_, i) =>
      short ? out.readUInt16BE(loca.offset + i * 2) * 2 : out.readUInt32BE(loca.offset + i * 4),
    );
    expect(offsets[offsets.length - 1]).toBe(glyf.length);
    for (const [i, offset] of offsets.entries())
      if (i > 0) expect(offset).toBeGreaterThanOrEqual(offsets[i - 1] ?? 0);
  });
});

describe('Own fonts in a PDF or EPUB', () => {
  const lora = readFileSync('public/fonts/lora/regular.ttf');

  test('reads the embedding permission of a font', () => {
    expect(embedProblem(lora)).toBeNull();
    expect(embedProblem(withFsType(lora, 0x0002))).toBe('Its license does not allow embedding.');
    expect(embedProblem(withFsType(lora, 0x0200))).toBe('Its license allows only bitmap embedding.');
    // Preview & Print (bit 2) and Editable (bit 3) both allow embedding.
    expect(embedProblem(withFsType(lora, 0x0004))).toBeNull();
    expect(embedProblem(withFsType(lora, 0x0008))).toBeNull();
    // An old font with bits 1 and 2 set: the less strict Preview and Print applies.
    expect(embedProblem(withFsType(lora, 0x0006))).toBeNull();
    expect(maySubset(lora)).toBe(true);
    expect(maySubset(withFsType(lora, 0x0100))).toBe(false);
    expect(embedProblem(undefined)).toBe('Vlo cannot read this font on this device.');
    expect(embedProblem(new Uint8Array([1, 2, 3, 4]))).toBe('Vlo cannot read this font file.');
  });

  test('picks the closest Vlo font from the design class, or else the name', () => {
    expect(standInFor('My Hand', undefined)).toBe('caveat');
    expect(standInFor('Office Mono', undefined)).toBe('courier-prime');
    expect(standInFor('Grotesk Sans', undefined)).toBe('inter');
    expect(standInFor('Bookish', undefined)).toBe('newsreader');
    expect(standInFor('Plain Name', readFileSync('public/fonts/jetbrains-mono/regular.ttf'))).toBe(
      'courier-prime',
    );
  });

  test('a font that forbids embedding gets a stand-in, and one that allows it goes in the file', () => {
    const check = checkOwnFonts(
      ['local:Allowed Serif', 'local:Locked Hand', 'local:Not Here'],
      new Map([
        ['local:Allowed Serif', lora],
        ['local:Locked Hand', withFsType(lora, 0x0002)],
        ['local:Not Here', null],
      ]),
    );
    expect([...check.own.keys()]).toEqual(['local:Allowed Serif']);
    expect(check.swaps).toEqual([
      {
        value: 'local:Locked Hand',
        name: 'Locked Hand',
        standIn: 'caveat',
        standInName: 'Caveat',
        reason: 'Its license does not allow embedding.',
      },
      {
        value: 'local:Not Here',
        name: 'Not Here',
        standIn: 'newsreader',
        standInName: 'Newsreader',
        reason: 'Vlo cannot read this font on this device.',
      },
    ]);
  });
});

describe.runIf(hasPoppler)('PDF export read by Poppler', () => {
  test('the poem fixture keeps its leading and inner spaces at their exact widths', async () => {
    const path = save((await toPdf(poemDoc(), options)).bytes);
    const [page = []] = words(path);
    const salt = find(page, 'Salt', 4);
    const left = salt.xMin;
    expect(left).toBeCloseTo(72, 1);
    expect(find(page, 'The').xMin - left).toBeCloseTo(spaces(4), 1);
    expect(find(page, 'and').xMin - left).toBeCloseTo(spaces(8), 1);
    expect(find(page, 'one').xMin - left).toBeCloseTo(spaces(12), 1);
    expect(find(page, 'drinks').xMin - left).toBeCloseTo(spaces(4), 1);
    // "I keep    the kettle    warm": four spaces between the words.
    const keep = find(page, 'keep');
    const the = page[page.indexOf(keep) + 1];
    expect(the?.text).toBe('the');
    expect((the?.xMin ?? 0) - keep.xMax).toBeCloseTo(spaces(4), 1);
    expect(pageText(path, 1)).toContain('without losing a single space.');
  });

  test('a long poem line wraps under its hanging indent', async () => {
    const long =
      'the long line keeps going past the right edge of the page so that it has to wrap at least once, and then it goes on a little more';
    const json = {
      type: 'doc',
      content: [
        {
          type: 'stanza',
          content: [{ type: 'poemLine', attrs: { hanging: 2 }, content: [{ type: 'text', text: long }] }],
        },
      ],
    };
    const path = save((await toPdf(singleDoc(json, 'poem'), options)).bytes);
    const [page = []] = words(path);
    const first = find(page, 'the');
    const lineTwo = page.find((w) => w.yMin > first.yMin + 5);
    expect(lineTwo).toBeDefined();
    // 2 em at 12 pt.
    expect((lineTwo?.xMin ?? 0) - first.xMin).toBeCloseTo(24, 1);
  });

  test('embeds every font it draws with, with the math font for symbols', async () => {
    const path = save((await toPdf(singleDoc(RICH_PROSE, 'prose'), options)).bytes);
    const list = fonts(path);
    expect(list.length).toBeGreaterThan(2);
    expect(list.every((f) => f.embedded)).toBe(true);
    const names = list.map((f) => f.name);
    expect(names.some((n) => n.startsWith('Newsreader'))).toBe(true);
    expect(names.some((n) => n.startsWith('EBGaramond'))).toBe(true);
    expect(names.some((n) => n.startsWith('NotoSansMath'))).toBe(true);
  });

  test('puts each footnote at the foot of the page that refers to it', async () => {
    const path = save((await toPdf(singleDoc(RICH_PROSE, 'prose'), options)).bytes);
    const [page = []] = words(path);
    const note = find(page, 'note');
    const body = find(page, 'Quoted');
    expect(note.yMin).toBeGreaterThan(body.yMin);
    expect(note.yMin).toBeGreaterThan(792 - 72 - 40);
    expect(pageText(path, 1)).toContain('A note with bold');
  });

  test('standard manuscript format: first page, header, double spacing and chapters a third down', async () => {
    const path = save(
      (
        await toPdf(novelDoc(), {
          ...options,
          manuscript: {
            name: 'Ada Marlow',
            contact: '12 Quay Street\nada@example.org',
            typewriter: true,
            words: 2040,
          },
        })
      ).bytes,
    );
    expect(fonts(path).map((f) => f.name)).toEqual(['CourierPrime-Regular']);
    const first = pageText(path, 1);
    expect(first).toContain('Ada Marlow');
    expect(first).toContain('12 Quay Street');
    expect(first).toContain('about 2,000 words');
    expect(first).toContain('Salt Year');
    expect(first).toContain('by Ada Marlow');
    expect(first).not.toContain('Marlow / SALT YEAR');

    const pages = words(path);
    const second = pages[1] ?? [];
    expect(pageText(path, 2)).toMatch(/Marlow \/ SALT YEAR \/ 1\s/);
    const chapter = find(second, 'Chapter');
    // A third of the way down the text area: 72 pt margin plus a third of 648 pt.
    expect(chapter.yMin).toBeGreaterThan(72 + 648 / 3 - 14);
    expect(chapter.yMin).toBeLessThan(72 + 648 / 3 + 14);
    // Double spacing: 2 x 1.2 x 12 pt from one line to the next.
    const p0 = find(second, 'Paragraph');
    const next = second.find((w) => w.yMin > p0.yMin + 1);
    expect((next?.yMin ?? 0) - p0.yMin).toBeCloseTo(28.8, 1);
    // The second chapter starts on a page of its own, also a third down.
    const later = pages.findIndex((list, i) => i > 1 && list.some((w) => w.text === 'Chapter'));
    expect(later).toBeGreaterThan(1);
    expect(pageText(path, later + 1)).toMatch(new RegExp(`Marlow / SALT YEAR / ${String(later)}\\s`));
  });

  test('an own font that allows embedding goes in the file, and a stand-in replaces a locked one', async () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Mine ',
              marks: [{ type: 'textStyle', attrs: { font: 'local:Kalam Own' } }],
            },
            {
              type: 'text',
              text: 'locked',
              marks: [{ type: 'textStyle', attrs: { font: 'local:Locked Hand' } }],
            },
          ],
        },
      ],
    };
    // pdf-lib checks for the page's own Uint8Array, so the Node Buffer becomes one.
    const kalam = new Uint8Array(readFileSync('public/fonts/kalam/regular.ttf'));
    const check = checkOwnFonts(
      ['local:Kalam Own', 'local:Locked Hand'],
      new Map([
        ['local:Kalam Own', kalam],
        ['local:Locked Hand', withFsType(readFileSync('public/fonts/lora/regular.ttf'), 0x0002)],
      ]),
    );
    const swaps = new Map(check.swaps.map((s) => [s.value, s.standIn]));
    expect(swaps.get('local:Locked Hand')).toBe('caveat');
    const path = save((await toPdf(singleDoc(json, 'prose'), { ...options, own: check.own, swaps })).bytes);
    const names = fonts(path).map((f) => f.name);
    expect(names.some((n) => n.startsWith('Kalam'))).toBe(true);
    expect(names.some((n) => n.startsWith('Caveat'))).toBe(true);
    expect(names.some((n) => n.startsWith('Lora'))).toBe(false);
  });
});

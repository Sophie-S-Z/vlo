import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, test } from 'vitest';
import {
  cleanPageSetup,
  DEFAULT_PAGE_SETUP,
  MAX_PAGE_LINE,
  marginsOf,
  pageLineText,
  shownMargin,
  typedMargin,
} from '@/features/editor/format/pageSetup';
import { buildExportDoc } from '@/features/export/build';
import { toDocx } from '@/features/export/docx';
import type { ExportDoc } from '@/features/export/model';
import { layOutPdf, type PdfOptions } from '@/features/export/pdf/pdf';
import type { Sink } from '@/features/export/pdf/sink';
import { toRtf } from '@/features/export/rtf';
import type { PageSetup } from '@/lib/db';
import { item, loadPublicFile, project, proseUpdate } from './export-fixtures';

/* Phase 19, Task F3: page setup. */

const options: PdfOptions = { loadFile: loadPublicFile };

const LINE =
  'The harbor lights came on one by one while the boats came in, and the gulls argued over the nets.';

/** A novel of two chapters with one scene each, long enough for several pages. */
function novel(pageSetup?: PageSetup): ExportDoc {
  const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${String(i)}. ${LINE} ${LINE}`);
  return buildExportDoc({
    project: project('novel', pageSetup ? { settings: { pageSetup } } : {}),
    items: [
      item('c1', 'chapter', 'Chapter One'),
      item('s1', 'scene', 'Arrival', 'c1'),
      item('c2', 'chapter', 'Chapter Two'),
      item('s2', 'scene', 'Night', 'c2'),
    ],
    scope: { kind: 'project' },
    updates: new Map([
      ['s1', proseUpdate(text)],
      ['s2', proseUpdate(text)],
    ]),
  });
}

interface Drawn {
  text: string;
  x: number;
  y: number;
}

/** The text that each page of the PDF draws, with its place. */
async function drawnPages(doc: ExportDoc): Promise<{ size: readonly [number, number]; pages: Drawn[][] }> {
  const laid = await layOutPdf(doc, options, await PDFDocument.create());
  const pages = laid.pages.map((_, index) => {
    const drawn: Drawn[] = [];
    const none = () => undefined;
    const sink: Sink = {
      text: (text, x, y) => {
        drawn.push({ text, x, y });
      },
      glow: none,
      gradientText: none,
      rect: none,
      line: none,
      shape: none,
      link: none,
      goTo: none,
      image: none,
    };
    laid.drawPage(index, sink);
    return drawn;
  });
  return { size: laid.size, pages };
}

async function wordParts(doc: ExportDoc): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await toDocx(doc));
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) out[name] = (await zip.file(name)?.async('string')) ?? '';
  return out;
}

const partsNamed = (parts: Record<string, string>, pattern: RegExp) =>
  Object.entries(parts)
    .filter(([name]) => pattern.test(name))
    .map(([, xml]) => xml)
    .join('');

describe('the stored page setup', () => {
  test('a missing setup is the default, and a wrong value is refused', () => {
    expect(cleanPageSetup(undefined)).toBe(DEFAULT_PAGE_SETUP);
    const custom: PageSetup = {
      margins: 'custom',
      custom: { top: 0.5, right: 1.25, bottom: 0.75, left: 3 },
      unit: 'mm',
      numbers: 'top-right',
      header: 'own',
      headerText: 'Draft',
      footer: 'item',
    };
    expect(cleanPageSetup(custom)).toEqual(custom);
    for (const wrong of [
      null,
      'normal',
      { ...DEFAULT_PAGE_SETUP, margins: 'huge' },
      { ...DEFAULT_PAGE_SETUP, numbers: 'left' },
      { ...DEFAULT_PAGE_SETUP, header: 'date' },
      { ...DEFAULT_PAGE_SETUP, unit: 'cm' },
      { ...DEFAULT_PAGE_SETUP, footerText: 'x'.repeat(MAX_PAGE_LINE + 1) },
      { ...custom, custom: null },
      { ...custom, custom: { ...custom.custom, left: 0.1 } },
      { ...custom, custom: { ...custom.custom, top: 4 } },
    ])
      expect(cleanPageSetup(wrong)).toBeNull();
  });

  test('each preset has its margins, and a custom margin shows and reads in inches or millimeters', () => {
    expect(marginsOf(DEFAULT_PAGE_SETUP)).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
    expect(marginsOf({ ...DEFAULT_PAGE_SETUP, margins: 'narrow' })).toEqual({
      top: 0.5,
      right: 0.5,
      bottom: 0.5,
      left: 0.5,
    });
    expect(marginsOf({ ...DEFAULT_PAGE_SETUP, margins: 'wide' })).toEqual({
      top: 1,
      right: 2,
      bottom: 1,
      left: 2,
    });
    // Custom with no stored margins keeps the normal margins.
    expect(marginsOf({ ...DEFAULT_PAGE_SETUP, margins: 'custom' })).toEqual(marginsOf(DEFAULT_PAGE_SETUP));
    expect(shownMargin(1, 'mm')).toBe(25);
    expect(shownMargin(1.234, 'in')).toBe(1.23);
    expect(typedMargin(50.8, 'mm')).toBeCloseTo(2);
    expect(typedMargin(0, 'in')).toBe(0.25);
    expect(typedMargin(200, 'mm')).toBe(3);
  });

  test('a page line names the project, the item or the own text', () => {
    const names = { project: 'Salt Year', item: 'Chapter One' };
    expect(pageLineText('none', 'Draft', names)).toBe('');
    expect(pageLineText('project', undefined, names)).toBe('Salt Year');
    expect(pageLineText('item', undefined, names)).toBe('Chapter One');
    expect(pageLineText('own', '  Draft 2  ', names)).toBe('Draft 2');
  });
});

describe('the PDF export', () => {
  test('each margin preset moves the text, and the pages hold less text with wider margins', async () => {
    const left = async (margins: PageSetup['margins']) => {
      const { pages } = await drawnPages(novel({ ...DEFAULT_PAGE_SETUP, margins }));
      // Page 1 is the title page. The text starts on page 2.
      const first = pages[1]?.find((d) => d.text.startsWith('Paragraph'));
      return { x: first?.x, pages: pages.length };
    };
    const normal = await left('normal');
    const narrow = await left('narrow');
    const wide = await left('wide');
    expect(normal.x).toBeCloseTo(72);
    expect(narrow.x).toBeCloseTo(36);
    expect(wide.x).toBeCloseTo(144);
    expect(narrow.pages).toBeLessThan(normal.pages);
    expect(wide.pages).toBeGreaterThan(normal.pages);
  });

  test('custom margins set each side', async () => {
    const setup: PageSetup = {
      ...DEFAULT_PAGE_SETUP,
      margins: 'custom',
      custom: { top: 2, right: 1, bottom: 1, left: 1.5 },
    };
    const { size, pages } = await drawnPages(novel(setup));
    const body = pages[1] ?? [];
    const top = Math.max(...body.filter((d) => d.text !== '1').map((d) => d.y));
    expect(body.find((d) => d.text.startsWith('Paragraph'))?.x).toBeCloseTo(108);
    // The first baseline sits under the 2 inch top margin.
    expect(top).toBeLessThan(size[1] - 144);
    expect(top).toBeGreaterThan(size[1] - 144 - 24);
  });

  test('page numbers sit at the bottom center, at the top right, or nowhere', async () => {
    const numberOn = async (numbers: PageSetup['numbers']) => {
      const { size, pages } = await drawnPages(novel({ ...DEFAULT_PAGE_SETUP, numbers }));
      return { size, number: pages[2]?.find((d) => d.text === '2') };
    };
    const bottom = await numberOn('bottom-center');
    expect(bottom.number?.y).toBeCloseTo(36);
    expect(bottom.number?.x).toBeGreaterThan(bottom.size[0] / 2 - 10);
    expect(bottom.number?.x).toBeLessThan(bottom.size[0] / 2);
    const topRight = await numberOn('top-right');
    expect(topRight.number?.y).toBeCloseTo(topRight.size[1] - 36);
    expect(topRight.number?.x).toBeGreaterThan(topRight.size[0] - 72 - 12);
    expect((await numberOn('none')).number).toBeUndefined();
  });

  test('the header line shows the title of the chapter on each page, and the footer line its own text', async () => {
    const setup: PageSetup = {
      ...DEFAULT_PAGE_SETUP,
      header: 'item',
      footer: 'own',
      footerText: 'Draft for the workshop',
    };
    const { size, pages } = await drawnPages(novel(setup));
    const header = (page: Drawn[]) => page.find((d) => d.y === size[1] - 36)?.text;
    // The title page has no lines.
    expect(pages[0]?.some((d) => d.text === 'Draft for the workshop')).toBe(false);
    expect(header(pages[1] ?? [])).toBe('Chapter One');
    expect(header(pages.at(-1) ?? [])).toBe('Chapter Two');
    expect(pages[1]?.find((d) => d.text === 'Draft for the workshop')).toMatchObject({ x: 72, y: 36 });
    const project = await drawnPages(novel({ ...DEFAULT_PAGE_SETUP, header: 'project' }));
    expect(header(project.pages[1] ?? [])).toBe('Salt Year');
  });

  test('a long page line ends with an ellipsis before the page number', async () => {
    const long = 'A footer line that goes on and on past the middle of the page where the number sits';
    const { pages } = await drawnPages(novel({ ...DEFAULT_PAGE_SETUP, footer: 'own', footerText: long }));
    const footer = pages[1]?.find((d) => d.y === 36 && d.x === 72)?.text ?? '';
    expect(footer.endsWith('…')).toBe(true);
    expect(long.startsWith(footer.slice(0, -1))).toBe(true);
  });
});

describe('the Word and RTF exports', () => {
  test('Word gets the margins, the page number field and the page lines', async () => {
    const setup: PageSetup = {
      margins: 'wide',
      numbers: 'top-right',
      header: 'item',
      footer: 'project',
    };
    const parts = await wordParts(novel(setup));
    const document = parts['word/document.xml'] ?? '';
    expect(document).toMatch(
      /<w:pgMar [^>]*w:top="1440"[^>]*w:right="2880"[^>]*w:bottom="1440"[^>]*w:left="2880"/,
    );
    const headers = partsNamed(parts, /^word\/header\d+\.xml$/);
    const footers = partsNamed(parts, /^word\/footer\d+\.xml$/);
    // The item line is a STYLEREF field, so Word shows the chapter of each page.
    expect(headers).toContain('STYLEREF &quot;Heading 2&quot;');
    expect(headers).toContain('PAGE');
    expect(footers).toContain('Salt Year');
    expect(footers).not.toContain('PAGE');
  });

  test('Word puts the page number in the center of the footer by default', async () => {
    const parts = await wordParts(novel());
    expect(parts['word/document.xml']).toMatch(/<w:pgMar [^>]*w:top="1440"[^>]*w:left="1440"/);
    expect(partsNamed(parts, /^word\/header\d+\.xml$/)).toBe('');
    const footers = partsNamed(parts, /^word\/footer\d+\.xml$/);
    expect(footers).toContain('PAGE');
    expect(footers).toMatch(/<w:tab w:val="center"/);
  });

  test('RTF gets the margins, the page number and the page lines', () => {
    const rtf = toRtf(
      novel({
        margins: 'custom',
        custom: { top: 0.5, right: 1, bottom: 0.75, left: 1.5 },
        numbers: 'bottom-center',
        header: 'own',
        headerText: 'Draft',
        footer: 'none',
      }),
    );
    expect(rtf).toContain('\\margl2160\\margr1440\\margt720\\margb1080');
    expect(rtf).toMatch(/\{\\header\\pard\\plain \\tqr\\tx\d+\\fs20 Draft\\par\}/);
    expect(rtf).toMatch(/\{\\footer\\pard\\plain \\tqc\\tx\d+\\fs20 \\tab\\chpgn\\par\}/);
  });
});

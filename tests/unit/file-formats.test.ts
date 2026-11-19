import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { toFdx } from '@/features/export/fountain';
import { runExport, type ExportRequest } from '@/features/export/run';
import { toRtf } from '@/features/export/rtf';
import { toHtmlFile, toPlainText } from '@/features/export/web';
import { readEpub } from '@/features/import/epub';
import { readFdx } from '@/features/import/fdx';
import { readHtml } from '@/features/import/html';
import { readOdt } from '@/features/import/odt';
import { pdfHtml, readPdf, type PdfLine } from '@/features/import/pdf';
import { readPicked, type PickedFile } from '@/features/import/read';
import { readRtf } from '@/features/import/rtf';
import { ImportError, type ImportNode } from '@/features/import/tree';
import { zipOf } from '../fixtures/import';
import {
  item,
  loadPublicFile,
  photoDoc,
  POEM_TEXT,
  poemUpdate,
  project,
  proseUpdate,
  RICH_PROSE,
  scriptUpdate,
  singleDoc,
} from './export-fixtures';

/*
 * The added file formats (roadmap F34): PDF, OpenDocument, RTF, EPUB, web page and Final Draft imports,
 * and the plain text, RTF and web page exports. Each export goes back through the import, so a file that
 * Vlo writes comes back with its words, its marks and its structure.
 */

const encoder = new TextEncoder();
const picked = (files: Record<string, string | Uint8Array>): PickedFile[] =>
  Object.entries(files).map(([path, data]) => ({
    path,
    read: () => Promise.resolve(typeof data === 'string' ? encoder.encode(data) : data),
  }));

const titles = (nodes: readonly ImportNode[]): unknown[] =>
  nodes.map((n) => (n.children ? [n.title, titles(n.children)] : n.title));

const poemDoc = () =>
  buildExportDoc({
    project: project('poetry'),
    items: [item('p1', 'poem', 'Salt on the Sill')],
    scope: { kind: 'item', itemId: 'p1' },
    updates: new Map([['p1', poemUpdate()]]),
  });

/** A novel with two chapters of two paragraphs each, as the whole project. */
function novelRequest(format: ExportRequest['format']): ExportRequest {
  return {
    project: project('novel', { authorName: 'Ada Marlow' }),
    items: [
      item('c1', 'chapter', 'The Ledger'),
      item('s1', 'scene', 'Counting', 'c1'),
      item('c2', 'chapter', 'The Key'),
      item('s2', 'scene', 'Leaving', 'c2'),
    ],
    scope: { kind: 'project' },
    updates: [
      ['s1', proseUpdate(['Mira counted the coins twice.', 'The tide turned at noon.'])],
      ['s2', proseUpdate(['Rosa left at dawn.', 'Nobody saw her go.'])],
    ],
    format,
    people: [],
    shareSafe: false,
  };
}

describe('plain text export', () => {
  test('a poem keeps every space, line and stanza as plain spaces, and reads back the same', async () => {
    const text = toPlainText(poemDoc());
    expect(text).toBe(`Salt on the Sill\n\n${POEM_TEXT.trimEnd()}\n`);
    expect(text).not.toContain('\u00a0');
    const source = await readPicked(picked({ 'Salt on the Sill.txt': text }));
    expect(source.nodes[0]?.text?.poem).toBe(text);
  });

  test('the file is a .txt with the notice about marks', async () => {
    const file = await runExport(novelRequest('text'));
    expect(file.name).toBe('Salt Year.txt');
    expect(file.type).toBe('text/plain;charset=utf-8');
    const text = new TextDecoder().decode(file.bytes);
    expect(text.startsWith('Salt Year\n\nAda Marlow\n\n')).toBe(true);
    expect(text).toContain('Mira counted the coins twice.\n\nThe tide turned at noon.');
    expect(file.notices[0]).toContain('Plain text has no bold');
  });

  test('a nested list stays under its item, and each block of an item starts a line', () => {
    const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const list = (...items: object[][]) => ({
      type: 'bulletList',
      content: items.map((content) => ({ type: 'listItem', content })),
    });
    const doc = singleDoc(
      { type: 'doc', content: [list([p('top'), list([p('mid')], [p('x')])], [p('next')])] },
      'prose',
    );
    expect(toPlainText(doc)).toContain('- top\n  - mid\n  - x\n- next');
  });
});

describe('RTF export', () => {
  test('keeps marks, links, footnotes and headings, and the RTF reader reads them back', () => {
    const rtf = toRtf(singleDoc(RICH_PROSE, 'prose'));
    expect(rtf.startsWith('{\\rtf1\\ansi')).toBe(true);
    expect(rtf).toContain('{\\b tide}');
    expect(rtf).toContain('HYPERLINK "https://example.org/a%20b"');
    expect(rtf).not.toContain('javascript:');
    expect(rtf).toContain('{\\footnote');
    const back = readRtf(rtf);
    expect(back.html).toContain('<strong>tide</strong>');
    expect(back.html).toContain('<em><u> turned</u></em>');
    expect(back.html).toContain('<s>gone</s>');
    expect(back.html).toContain('H<sub>2</sub>O x<sup>2</sup>');
    expect(back.html).toContain('data-note="&quot;A note with bold&quot;"');
    expect(back.html).toContain('<h3>Harbor</h3>');
    expect(back.text).toContain('Quoted words');
  });

  test('a poem keeps every space, line and stanza through an import', async () => {
    const source = await readPicked(picked({ 'Salt.rtf': toRtf(poemDoc()) }));
    expect(source.nodes[0]?.title).toBe('Salt on the Sill');
    expect(source.nodes[0]?.text?.poem).toBe(POEM_TEXT);
  });

  test('characters past ASCII and braces are escaped', () => {
    const rtf = toRtf(
      singleDoc(
        {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Café {x} \\ “é” 🌊' }] }],
        },
        'prose',
      ),
    );
    expect(readRtf(rtf).text).toContain('Café {x} \\ “é” 🌊');
  });

  test('images go in the file, and an image that is not on this device is named', () => {
    const rtf = toRtf(photoDoc());
    expect(rtf).toContain('\\jpegblip');
    expect(rtf).toContain('\\pngblip');
    expect(rtf).toContain('[Image: A lost photo]');
    expect(readRtf(rtf).skipped).toEqual(['2 pictures']);
  });

  test('a novel comes back with its chapters', async () => {
    const file = await runExport(novelRequest('rtf'));
    expect(file.name).toBe('Salt Year.rtf');
    const source = await readPicked(picked({ [file.name]: file.bytes }));
    expect(titles(source.nodes)).toEqual([['Salt Year', ['The Ledger', 'The Key']]]);
  });
});

describe('web page export', () => {
  test('a whole page with the title, the author and the images inside', () => {
    const html = toHtmlFile({ ...photoDoc(), author: 'Ada Marlow' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>The Kettle</title>');
    expect(html).toContain('<h1>The Kettle</h1>\n<p>Ada Marlow</p>');
    expect(html).toContain('<img src="data:image/jpeg;base64,');
    expect(html).toContain('<figcaption>The harbour at dawn</figcaption>');
    expect(html).toContain('[Image: A lost photo]');
  });

  test('a novel comes back with its chapters and its words', async () => {
    const file = await runExport(novelRequest('html'));
    expect(file.name).toBe('Salt Year.html');
    const source = await readPicked(picked({ [file.name]: file.bytes }));
    expect(source.title).toBe('Salt Year');
    expect(titles(source.nodes)).toEqual(['The Ledger', 'The Key']);
    expect(source.nodes[1]?.text?.html).toBe('<p>Rosa left at dawn.</p><p>Nobody saw her go.</p>');
  });
});

describe('web page import', () => {
  test('keeps the text and the tables, and leaves out menus, scripts and pictures', () => {
    const { nodes, skipped } = readHtml(
      'post.html',
      `<html><head><title>Salt Year</title><script>alert(1)</script></head><body>
<nav><a href="/">Home</a></nav>
<article><h1>Salt Year</h1>
<div class="wrap"><h2>The ledger</h2><div>Mira <b>counted</b> the coins.</div><p>She <i>slept</i>.<img src="x.png"></p></div>
<hr><table><tr><td>Coins</td></tr></table>
<h2>The key</h2><ul><li>One</li></ul><pre>  a\n  b</pre></article>
<footer>Copyright</footer></body></html>`,
    );
    expect(titles(nodes)).toEqual(['The ledger', 'The key']);
    expect(nodes[0]?.text?.html).toBe(
      '<p>Mira <b>counted</b> the coins.</p><p>She <i>slept</i>.</p><div data-scene-break=""></div><table><tbody><tr><td>Coins</td></tr></tbody></table>',
    );
    expect(nodes[1]?.text?.html).toBe('<ul><li>One</li></ul><p>  a<br>  b</p>');
    expect(skipped).toEqual(['1 picture']);
    expect(JSON.stringify(nodes)).not.toMatch(/alert|Home|Copyright/);
  });

  test('a web page line of stars is a scene break, as Vlo writes one', () => {
    const { nodes } = readHtml(
      'a.html',
      '<p>A.</p><p align="center">*&#160;&#160;*&#160;&#160;*</p><p>B.</p>',
    );
    expect(nodes[0]?.text?.html).toBe('<p>A.</p><div data-scene-break=""></div><p>B.</p>');
  });
});

describe('EPUB import', () => {
  test("Vlo's own EPUB comes back with its title, author and chapters", async () => {
    const file = await runExport(novelRequest('epub'), new Map(), { loadFile: loadPublicFile });
    const book = await readEpub(file.name, file.bytes);
    expect(book.title).toBe('Salt Year');
    expect(book.author).toBe('Ada Marlow');
    expect(titles(book.nodes)).toEqual(['The Ledger', 'The Key']);
    expect(book.nodes[0]?.text?.html).toContain('Mira counted the coins twice.');
    expect(JSON.stringify(book.nodes)).not.toContain('Contents');
  });

  test('a book with DRM and a file that is not an EPUB each give a message', async () => {
    const drm = await zipOf({
      'META-INF/container.xml': '<container/>',
      'META-INF/encryption.xml': '<encryption><CipherReference URI="OEBPS/ch1.xhtml"/></encryption>',
    });
    await expect(readEpub('a.epub', drm)).rejects.toThrow('DRM');
    await expect(readEpub('b.epub', encoder.encode('no'))).rejects.toThrow(ImportError);
  });
});

describe('OpenDocument import', () => {
  const T = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
  const S = 'urn:oasis:names:tc:opendocument:xmlns:style:1.0';
  const F = 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0';
  const O = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
  const D = 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0';
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="${O}" xmlns:text="${T}" xmlns:style="${S}" xmlns:fo="${F}" xmlns:draw="${D}" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">
<office:automatic-styles>
<style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="T2" style:family="text" style:parent-style-name="Emphasis"><style:text-properties style:text-underline-style="solid"/></style:style>
<style:style style:name="T3" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>
<text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style>
</office:automatic-styles>
<office:body><office:text>
<text:tracked-changes><text:changed-region><text:deletion><text:p>gone</text:p></text:deletion></text:changed-region></text:tracked-changes>
<text:h text:outline-level="1">Chapter One</text:h>
<text:h text:outline-level="2">The ledger</text:h>
<text:p><text:span text:style-name="T1">Mira</text:span> counted<text:s text:c="2"/>the <text:span text:style-name="T2">coins</text:span> x<text:span text:style-name="T3">2</text:span><text:note><text:note-citation>1</text:note-citation><text:note-body><text:p>Forty short.</text:p></text:note-body></text:note>.<office:annotation><text:p>A comment</text:p></office:annotation></text:p>
<text:p>Rosa<text:tab/>left<text:line-break/>at <text:a>dawn</text:a>.<draw:frame><draw:image/></draw:frame></text:p>
<table:table><table:table-row><table:table-cell><text:p>Coins</text:p></table:table-cell></table:table-row></table:table>
<text:list text:style-name="L1"><text:list-item><text:p>One</text:p></text:list-item></text:list>
</office:text></office:body></office:document-content>`;
  const styles = `<office:document-styles xmlns:office="${O}" xmlns:style="${S}" xmlns:fo="${F}"><office:styles>
<style:style style:name="Emphasis" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
</office:styles></office:document-styles>`;

  test('headings split the file, and marks, spaces, notes and lists stay', async () => {
    const { nodes, skipped } = await readOdt(
      'Salt Year.odt',
      await zipOf({ 'content.xml': content, 'styles.xml': styles }),
    );
    expect(titles(nodes)).toEqual([['Chapter One', ['The ledger']]]);
    expect(nodes[0]?.children?.[0]?.text?.html).toBe(
      '<p><strong>Mira</strong> counted  the <em><u>coins</u></em> x<sup>2</sup><sup data-footnote="" data-note="&quot;Forty short.&quot;"></sup>.</p>' +
        '<p>Rosa\tleft<br>at dawn.</p><ol><li><p>One</p></li></ol>',
    );
    expect(skipped).toEqual(['1 picture', '1 table']);
    expect(JSON.stringify(nodes)).not.toMatch(/gone|A comment/);
  });

  test('a span adds its marks to the marks of its paragraph', async () => {
    const bold = `<office:document-content xmlns:office="${O}" xmlns:text="${T}" xmlns:style="${S}" xmlns:fo="${F}">
<office:automatic-styles>
<style:style style:name="P1" style:family="paragraph"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="T1" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
</office:automatic-styles>
<office:body><office:text><text:p text:style-name="P1">Salt <text:span text:style-name="T1">tide</text:span></text:p></office:text></office:body>
</office:document-content>`;
    const { nodes } = await readOdt('Bold.odt', await zipOf({ 'content.xml': bold }));
    expect(nodes[0]?.text?.html).toBe('<p><strong>Salt </strong><strong><em>tide</em></strong></p>');
  });

  test('a file that is not an OpenDocument file gives a message for the writer', async () => {
    await expect(readOdt('a.odt', encoder.encode('no'))).rejects.toThrow(ImportError);
  });
});

describe('Final Draft import', () => {
  test("Vlo's own Final Draft file comes back scene by scene with each element", () => {
    const doc = buildExportDoc({
      project: project('script'),
      items: [item('x1', 'scene', 'Dock')],
      scope: { kind: 'item', itemId: 'x1' },
      updates: new Map([
        [
          'x1',
          scriptUpdate([
            ['heading', 'INT. DOCK - NIGHT'],
            ['action', 'Rain.'],
            ['character', 'MIRA'],
            ['parenthetical', '(quietly)'],
            ['dialogue', 'Forty short.'],
            ['heading', 'EXT. HARBOUR - DAWN'],
            ['transition', 'CUT TO:'],
          ]),
        ],
      ]),
    });
    const nodes = readFdx(toFdx(doc));
    expect(titles(nodes)).toEqual(['INT. DOCK - NIGHT', 'EXT. HARBOUR - DAWN']);
    expect(nodes[0]?.text?.html).toBe(
      '<p data-role="heading">INT. DOCK - NIGHT</p><p data-role="action">Rain.</p><p data-role="character">MIRA</p><p data-role="parenthetical">(quietly)</p><p data-role="dialogue">Forty short.</p>',
    );
    expect(nodes[1]?.text?.poem).toBe('EXT. HARBOUR - DAWN\nCUT TO:\n');
  });

  test('bold, italic and underline stay', () => {
    const nodes = readFdx(
      '<FinalDraft><Content><Paragraph Type="Action"><Text Style="Bold+Italic">Loud</Text><Text> then </Text><Text Style="Underline">quiet</Text></Paragraph></Content></FinalDraft>',
    );
    expect(nodes[0]?.title).toBe('Opening');
    expect(nodes[0]?.text?.html).toBe(
      '<p data-role="action"><strong><em>Loud</em></strong> then <u>quiet</u></p>',
    );
  });
});

describe('RTF import', () => {
  test("Word's outline levels split the file into folders and items", async () => {
    const source = await readPicked(
      picked({
        'Salt.rtf': String.raw`{\rtf1\ansi{\stylesheet{\s1\outlinelevel0 heading 1;}}\pard\s1\outlinelevel0 Part One\par\pard\outlinelevel1 Chapter\par\pard Mira {\b counted}.\par}`,
      }),
    );
    expect(titles(source.nodes)).toEqual([['Part One', ['Chapter']]]);
    expect(source.nodes[0]?.children?.[0]?.text?.html).toBe('<p>Mira <strong>counted</strong>.</p>');
  });
});

describe('PDF import', () => {
  const line = (text: string, y: number, extra: Partial<PdfLine> = {}): PdfLine => ({
    text,
    x: 72,
    y,
    right: 72 + text.length * 6,
    size: 12,
    ...extra,
  });
  const full = (text: string, y: number) => line(text, y, { right: 540 });

  test('lines become paragraphs across pages, with headings, verse and no page numbers', () => {
    const pages: PdfLine[][] = [
      [
        line('Salt Year', 700, { size: 28 }),
        line('Chapter One', 640, { size: 18 }),
        full('Mira counted the coins twice and found the ledger forty short of what the', 600),
        full('harbour master had promised. She counted them again, slow-', 586),
        line('ly, and slept.', 572),
        full('The tide turned at noon and', 558),
        line('1', 40),
      ],
      [
        line('the boats came in.', 700),
        line('Chapter Two', 640, { size: 18 }),
        line('Salt on the sill,', 600),
        line('salt in the seams', 586, { x: 84 }),
        line('of every coat.', 572),
        line('* * *', 540, { x: 290 }),
        full('Rosa left at dawn, and nobody saw her go down to the water that day.', 510),
        line('2', 40),
      ],
    ];
    const { html, title } = pdfHtml(pages);
    expect(title).toBe('Salt Year');
    expect(html).toBe(
      '<h1>Chapter One</h1>' +
        '<p>Mira counted the coins twice and found the ledger forty short of what the harbour master had promised. She counted them again, slowly, and slept.</p>' +
        '<p>The tide turned at noon and the boats came in.</p>' +
        '<h1>Chapter Two</h1>' +
        '<p>Salt on the sill,<br>\u00a0\u00a0salt in the seams<br>of every coat.</p>' +
        '<div data-scene-break=""></div>' +
        '<p>Rosa left at dawn, and nobody saw her go down to the water that day.</p>',
    );
  });

  test('a running head that repeats at the top of most pages stays out', () => {
    const words = ['Mira counted.', 'Rosa left.', 'Nobody saw.'];
    const pages = words.map((text, n) => [line(`Salt Year ${String(n + 1)}`, 750), line(text, 700)]);
    expect(pdfHtml(pages).html).toBe('<p>Mira counted. Rosa left. Nobody saw.</p>');
  });

  async function pdfBytes(draw: (page: PDFPage, font: PDFFont, n: number) => void, pages = 1) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    for (let n = 1; n <= pages; n += 1) draw(pdf.addPage([612, 792]), font, n);
    return pdf.save();
  }

  test('reads the text of a real PDF with PDF.js', async () => {
    const bytes = await pdfBytes((page, font, n) => {
      page.drawText(n === 1 ? 'Chapter One' : 'Chapter Two', { x: 72, y: 700, size: 20, font });
      page.drawText(n === 1 ? 'Mira counted the coins.' : 'Rosa left at dawn.', {
        x: 72,
        y: 660,
        size: 12,
        font,
      });
      page.drawText(String(n), { x: 300, y: 40, size: 10, font });
    }, 2);
    const source = await readPicked(picked({ 'Salt Year.pdf': bytes }));
    expect(source.title).toBe('Salt Year');
    expect(titles(source.nodes)).toEqual(['Chapter One', 'Chapter Two']);
    expect(source.nodes[1]?.text?.html).toBe('<p>Rosa left at dawn.</p>');
    expect(source.skipped).toEqual(['the page layout and the bold and italic of the PDF']);
  });

  test("Vlo's own PDF comes back with its chapters", async () => {
    const file = await runExport(novelRequest('pdf'), new Map(), { loadFile: loadPublicFile });
    const book = await readPdf(file.name, file.bytes);
    expect(titles(book.nodes).slice(-2)).toEqual(['The Ledger', 'The Key']);
    expect(book.nodes.at(-1)?.text?.html).toContain('Rosa left at dawn.');
  });

  test('a PDF with no text and a file that is not a PDF each give a message', async () => {
    const blank = await pdfBytes(() => undefined);
    await expect(readPdf('scan.pdf', blank)).rejects.toThrow('no text');
    await expect(readPdf('bad.pdf', encoder.encode('not a pdf'))).rejects.toThrow('cannot open this PDF');
  });
});

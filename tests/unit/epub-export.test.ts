import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { toEpub, type EpubOptions } from '@/features/export/epub';
import { xmlText } from '@/features/export/xml';
import type { ExportDoc } from '@/features/export/model';
import {
  item,
  loadPublicFile,
  POEM_TEXT,
  poemUpdate,
  project,
  proseUpdate,
  RICH_PROSE,
  singleDoc,
} from './export-fixtures';

/*
 * EPUB 3 export (spec section 9, plan Task B5). The structure check reads the file as an e-reader does:
 * the mimetype first and stored, the container, the package with its manifest and spine, the nav, and
 * every XHTML file as strict XML.
 */

const options: EpubOptions = {
  loadFile: loadPublicFile,
  id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
  modified: new Date('2026-11-04T10:00:00.500Z'),
};

const NBSP = ' ';

interface Book {
  zip: JSZip;
  raw: Uint8Array;
  opf: Document;
  text: (path: string) => Promise<string>;
}

function parseXml(xml: string, type: DOMParserSupportedType = 'application/xml'): Document {
  const doc = new DOMParser().parseFromString(xml, type);
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new Error(`Not well-formed: ${error.textContent}`);
  return doc;
}

async function open(bytes: Uint8Array): Promise<Book> {
  const zip = await JSZip.loadAsync(bytes);
  const text = async (path: string) => {
    const file = zip.file(path);
    if (!file) throw new Error(`The EPUB has no ${path}.`);
    return file.async('string');
  };
  return { zip, raw: bytes, opf: parseXml(await text('OEBPS/content.opf')), text };
}

function poemDoc(): ExportDoc {
  return buildExportDoc({
    project: project('poetry'),
    items: [item('p1', 'poem', 'Salt on the Sill')],
    scope: { kind: 'item', itemId: 'p1' },
    updates: new Map([['p1', poemUpdate()]]),
  });
}

function novelDoc(): ExportDoc {
  return buildExportDoc({
    project: project('novel', { authorName: 'Ada Marlow' }),
    items: [
      item('c1', 'chapter', 'Chapter One'),
      item('s1', 'scene', 'Arrival', 'c1'),
      item('s2', 'scene', 'Later', 'c1'),
      item('c2', 'chapter', 'Chapter Two'),
      item('s3', 'scene', 'Night', 'c2'),
    ],
    scope: { kind: 'project' },
    updates: new Map([
      ['s1', proseUpdate(['The harbor lights came on.'])],
      ['s2', proseUpdate(['The boats came in.'])],
      ['s3', proseUpdate(['The gulls slept.'])],
    ]),
  });
}

describe('EPUB export', () => {
  test('passes the structure check: mimetype, container, package, nav and strict XHTML', async () => {
    for (const doc of [poemDoc(), novelDoc(), singleDoc(RICH_PROSE, 'prose')]) {
      const book = await open((await toEpub(doc, options)).bytes);
      // The mimetype is the first file, stored without compression, at byte 30 of the file.
      expect(Object.keys(book.zip.files)[0]).toBe('mimetype');
      expect(new TextDecoder().decode(book.raw.slice(30, 38))).toBe('mimetype');
      expect(new TextDecoder().decode(book.raw.slice(38, 58))).toBe('application/epub+zip');
      expect(book.raw[8]).toBe(0);

      const container = parseXml(await book.text('META-INF/container.xml'));
      expect(container.getElementsByTagName('rootfile')[0]?.getAttribute('full-path')).toBe(
        'OEBPS/content.opf',
      );

      const pkg = book.opf.documentElement;
      expect(pkg.getAttribute('version')).toBe('3.0');
      const id = pkg.getAttribute('unique-identifier') ?? '';
      expect(book.opf.getElementById(id)?.textContent).toBe(options.id);
      expect(book.opf.getElementsByTagName('meta')[0]?.textContent).toBe('2026-11-04T10:00:00Z');
      expect(book.opf.getElementsByTagName('dc:title')[0]?.textContent).toBe(doc.title);

      // Every manifest item is in the zip, every content file is in the manifest, and the spine reads them.
      const items = [...book.opf.getElementsByTagName('item')];
      const hrefs = items.map((i) => `OEBPS/${i.getAttribute('href') ?? ''}`);
      for (const href of hrefs) expect(book.zip.file(href), href).not.toBeNull();
      const files = Object.keys(book.zip.files).filter((f) => !book.zip.files[f]?.dir);
      expect(
        files
          .filter((f) => f !== 'mimetype' && f !== 'OEBPS/content.opf' && !f.startsWith('META-INF/'))
          .sort(),
      ).toEqual([...hrefs].sort());
      const ids = new Set(items.map((i) => i.getAttribute('id')));
      const spine = [...book.opf.getElementsByTagName('itemref')].map((r) => r.getAttribute('idref'));
      expect(spine.length).toBeGreaterThan(0);
      for (const ref of spine) expect(ids.has(ref)).toBe(true);
      expect(items.filter((i) => i.getAttribute('properties') === 'nav')).toHaveLength(1);

      for (const item of items.filter((i) => i.getAttribute('media-type') === 'application/xhtml+xml')) {
        const path = `OEBPS/${item.getAttribute('href') ?? ''}`;
        const xhtml = parseXml(await book.text(path), 'application/xhtml+xml');
        expect(xhtml.documentElement.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
        // A file with MathML says so in the manifest, as EPUB 3 requires.
        const hasMath = xhtml.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'math').length > 0;
        expect(item.getAttribute('properties')?.includes('mathml') ?? false, path).toBe(hasMath);
      }
    }
  });

  test('keeps every poem space: leading spaces become no-break spaces, inner spaces stay', async () => {
    const book = await open((await toEpub(poemDoc(), options)).bytes);
    const xhtml = parseXml(await book.text('OEBPS/text/part-1.xhtml'), 'application/xhtml+xml');
    const lines = [...xhtml.querySelectorAll('.stanza')].map((stanza) =>
      [...stanza.querySelectorAll('p.line')].map((p) => p.textContent.replaceAll(NBSP, ' ')),
    );
    expect(lines.map((stanza) => stanza.join('\n')).join('\n\n')).toBe(POEM_TEXT.replace(/\n$/, ''));
    expect(xhtml.querySelectorAll('.stanza p.line')[1]?.textContent).toBe(
      `${NBSP.repeat(4)}The tide goes out`,
    );
    const css = await book.text('OEBPS/styles.css');
    expect(css).toMatch(/\.stanza p\.line \{[^}]*white-space: pre-wrap/);
  });

  test('a hanging indent wraps the rest of the line under the indent', async () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'stanza',
          content: [
            { type: 'poemLine', attrs: { hanging: 2 }, content: [{ type: 'text', text: 'a long line' }] },
          ],
        },
      ],
    };
    const book = await open((await toEpub(singleDoc(json, 'poem'), options)).bytes);
    expect(await book.text('OEBPS/text/part-1.xhtml')).toContain(
      '<p class="line" style="padding-left: 2em; text-indent: -2em">a long line</p>',
    );
  });

  test('carries every style, footnotes as asides, MathML and a gradient with a plain color fallback', async () => {
    const book = await open((await toEpub(singleDoc(RICH_PROSE, 'prose'), options)).bytes);
    const html = await book.text('OEBPS/text/part-1.xhtml');
    expect(html).toContain('<span class="drop-cap">O</span>nce  the <strong>tide</strong>');
    expect(html).toContain('<span style="text-decoration: line-through">gone</span>');
    expect(html).toContain('H<sub>2</sub>O x<sup>2</sup>');
    expect(html).toContain('<mark style="background-color: #');
    expect(html).toContain("font-family: 'Vlo EB Garamond', serif; font-size: 1.5em");
    expect(html).toContain('<a href="https://example.org/a%20b"> site</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain(
      '<a class="noteref" epub:type="noteref" role="doc-noteref" id="ref-1" href="#note-1">1</a>',
    );
    expect(html).toContain('<aside epub:type="footnote" role="doc-footnote" id="note-1">');
    expect(html).toContain('A note with <strong>bold</strong>');
    expect(html).toContain(
      '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" alttext="\\frac{a}{b}"><mfrac>',
    );
    expect(html).toContain('display="block"');
    expect(html).toContain('<p class="scene-break" role="separator">#</p>');
    expect(html).toContain('<ol start="3">');

    const css = await book.text('OEBPS/styles.css');
    expect(css).toContain('.fill-1 { color: #b8860b; }');
    expect(css).toContain('background-image: linear-gradient(90deg, #b8860b 0%, #ffd700 50%, #8b6508 100%)');
    expect(css).toContain('@supports ((-webkit-background-clip: text) or (background-clip: text))');
  });

  test('embeds the fonts the text uses, one file for each style', async () => {
    const result = await toEpub(singleDoc(RICH_PROSE, 'prose'), options);
    const book = await open(result.bytes);
    const fonts = Object.keys(book.zip.files)
      .filter((f) => f.endsWith('.ttf'))
      .sort();
    expect(fonts).toEqual([
      'OEBPS/fonts/eb-garamond/regular.ttf',
      'OEBPS/fonts/newsreader/bold.ttf',
      'OEBPS/fonts/newsreader/italic.ttf',
      'OEBPS/fonts/newsreader/regular.ttf',
    ]);
    const css = await book.text('OEBPS/styles.css');
    expect(css).toContain(
      '@font-face { font-family: \'Vlo Newsreader\'; font-weight: 700; font-style: normal; src: url("fonts/newsreader/bold.ttf"); }',
    );
    expect(result.drawnStyles).toEqual([]);
  });

  test('a book gets a title page, one file for each chapter and a table of contents', async () => {
    const book = await open((await toEpub(novelDoc(), options)).bytes);
    const spine = [...book.opf.getElementsByTagName('itemref')].map((r) => r.getAttribute('idref'));
    expect(spine).toEqual(['title', 'part-1', 'part-2']);
    expect(await book.text('OEBPS/text/title.xhtml')).toContain('<p class="author">Ada Marlow</p>');
    const part1 = await book.text('OEBPS/text/part-1.xhtml');
    expect(part1).toContain('The harbor lights came on.');
    expect(part1).toContain('The boats came in.');
    expect(part1).not.toContain('The gulls slept.');
    const nav = parseXml(await book.text('OEBPS/nav.xhtml'), 'application/xhtml+xml');
    const links = [...nav.querySelectorAll('nav a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Salt Year', 'text/title.xhtml'],
      ['Chapter One', 'text/part-1.xhtml#s1'],
      ['Chapter Two', 'text/part-2.xhtml#s4'],
    ]);
    expect(book.opf.getElementsByTagName('dc:creator')[0]?.textContent).toBe('Ada Marlow');
  });

  test('an own font goes in the book when its license allows it, and a stand-in takes the place of the rest', async () => {
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
    const own = new Map([['local:Kalam Own', await loadPublicFile('fonts/kalam/regular.ttf')]]);
    const swaps = new Map([['local:Locked Hand', 'caveat']]);
    const book = await open((await toEpub(singleDoc(json, 'prose'), { ...options, own, swaps })).bytes);
    const files = Object.keys(book.zip.files);
    expect(files).toContain('OEBPS/fonts/own-2.ttf');
    expect(files).toContain('OEBPS/fonts/caveat/regular.ttf');
    const html = await book.text('OEBPS/text/part-1.xhtml');
    expect(html).toContain("font-family: 'Vlo Kalam Own', serif");
    expect(html).toContain("font-family: 'Vlo Caveat', cursive");
  });

  test('escapes text for XML and leaves out characters XML forbids', () => {
    expect(xmlText('a < b & "c" > d\u0001')).toBe('a &lt; b &amp; &quot;c&quot; &gt; d');
  });
});

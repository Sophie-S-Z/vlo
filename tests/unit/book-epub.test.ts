import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { epubPreview, toEpub, type EpubOptions } from '@/features/export/epub';
import { BOOK, bookNovel, loadPublicFile } from './export-fixtures';

/*
 * Book EPUBs (roadmap F51, plan Task J6). The front and back matter are files of their own with their
 * `epub:type`. epubcheck.test.ts runs EPUBCheck on each EPUB that the tests make.
 */

const options: EpubOptions = {
  loadFile: loadPublicFile,
  id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
  modified: new Date('2026-11-10T10:00:00Z'),
};

async function read(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const text = async (path: string) => (await zip.file(path)?.async('string')) ?? '';
  return { zip, text, opf: await text('OEBPS/content.opf') };
}

describe('book EPUB', () => {
  test('the front and back matter are their own files, each with its epub:type, in book order', async () => {
    const book = await read((await toEpub(bookNovel(), options)).bytes);
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
    const book = await read((await toEpub(bookNovel(), options)).bytes);
    const nav = await book.text('OEBPS/nav.xhtml');
    const titles = [...nav.matchAll(/<a href="[^"]+">([^<]+)<\/a>/g)].map((m) => m[1]);
    expect(titles).toEqual(['Salt Year', 'The Harbor', 'Chapter Two', 'Acknowledgments', 'About the author']);
    // With the contents page off, the nav stays out of the reading order.
    const off = await read((await toEpub(bookNovel({ ...BOOK, contents: false }), options)).bytes);
    expect(off.opf).not.toContain('<itemref idref="nav"/>');
  });

  test('chapters get their number and drop cap, and the CSS holds the chapter and scene break styles', async () => {
    const book = await read((await toEpub(bookNovel(), options)).bytes);
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
    const modern = await read((await toEpub(bookNovel({ ...BOOK, chapter: 'modern' }), options)).bytes);
    expect(await modern.text('OEBPS/styles.css')).toContain('font-size: 3.2em');
  });

  test('the e-reader preview is the same XHTML and CSS in one page, with fonts from the app', async () => {
    const html = await epubPreview(bookNovel(), 'https://vlo.test/');
    expect(html).toContain('For the keepers of the light.');
    expect(html).toContain('<p class="chapter-number">1</p>');
    expect(html).toContain('url("https://vlo.test/fonts/newsreader/regular.ttf")');
    expect(html).not.toContain('<script');
  });
});

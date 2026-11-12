import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { afterAll, describe, expect, test } from 'vitest';
import type { Backup } from '@/features/backup/file';
import { toDocx } from '@/features/export/docx';
import { toEpub } from '@/features/export/epub';
import { toFountain } from '@/features/export/fountain';
import type { ManuscriptSetup } from '@/features/export/manuscript';
import { markdownFile, toMarkdown } from '@/features/export/markdown';
import { exportNotices } from '@/features/export/notices';
import { toPdf } from '@/features/export/pdf/pdf';
import { walkawayZip } from '@/features/export/walkaway';
import { toWebHtml, toWebText } from '@/features/export/web';
import {
  IMAGES,
  imageNode as image,
  item,
  JPEG,
  JPEG_IMAGE,
  loadPublicFile,
  photoDoc,
  PNG,
  project,
  singleDoc,
  updateOf,
} from './export-fixtures';

/*
 * Images in exports (Phase 16, decision G5). Word, PDF and EPUB embed each image with its alt text. Markdown
 * comes as a zip with an images folder. Standard manuscript format, web copies and scripts write a line
 * that names the image. An image that is not on this device gets that line in every format.
 */

const setup: ManuscriptSetup = {
  name: 'Ada Marlow',
  contact: '12 Quay Street',
  typewriter: true,
  words: 2040,
};

const hasPoppler = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).status === 0;
const dir = mkdtempSync(join(tmpdir(), 'vlo-images-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function pdfText(bytes: Uint8Array): string {
  const path = join(dir, 'out.pdf');
  writeFileSync(path, bytes);
  return execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
}

/** The number of images that the pages of a PDF draw. */
async function pdfImages(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes);
  let count = 0;
  for (const page of pdf.getPages()) {
    const objects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!objects) continue;
    for (const [, ref] of objects.entries()) {
      const object = pdf.context.lookup(ref);
      const dict = object && 'dict' in object ? (object.dict as PDFDict) : undefined;
      if (dict?.get(PDFName.of('Subtype')) === PDFName.of('Image')) count += 1;
    }
  }
  return count;
}

/** The width and the height at which the first page draws each image, from its content stream. */
async function drawnSizes(bytes: Uint8Array): Promise<[number, number][]> {
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPages()[0]?.node.Contents();
  const streams =
    contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  const text = streams
    .map((s) => (s instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(s).decode()) : ''))
    .join('\n');
  // pdf-lib draws an image as "w 0 0 h 0 0 cm" and then "Do".
  return [...text.matchAll(/^([\d.]+) 0 0 ([\d.]+) 0 0 cm$/gm)]
    .map((m): [number, number] => [Number(m[1]), Number(m[2])])
    .filter(([w, h]) => w !== 1 || h !== 1);
}

describe('Images in exports', () => {
  test('the export reads each image with its alt text, caption, size and place', () => {
    const blocks = photoDoc().sections[0]?.blocks.filter((b) => b.type === 'image');
    expect(blocks).toEqual([
      {
        type: 'image',
        id: 'harbour',
        alt: 'Boats in the harbour',
        decorative: false,
        caption: 'The harbour at dawn',
        width: 75,
        align: 'center',
      },
      { type: 'image', id: 'seal', alt: '', decorative: true, caption: '', width: 33, align: 'left' },
      {
        type: 'image',
        id: 'gone',
        alt: 'A lost photo',
        decorative: false,
        caption: '',
        width: 100,
        align: 'center',
      },
    ]);
  });

  test('Word embeds the bytes of each image with its alt text and caption', async () => {
    const zip = await JSZip.loadAsync(await toDocx(photoDoc()));
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'));
    expect(media).toHaveLength(2);
    const stored = await Promise.all(
      media.map((name) => zip.file(name)?.async('uint8array') ?? Promise.resolve(undefined)),
    );
    expect(stored).toEqual(expect.arrayContaining([JPEG, PNG]));
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(xml).toContain('descr="Boats in the harbour"');
    expect(xml).toContain('title="The harbour at dawn"');
    // A decorative image has no description, so a screen reader passes it.
    expect(xml).toContain('<wp:docPr id="2" name="Image 2"/>');
    expect(xml).toContain('The harbour at dawn</w:t>');
    expect(xml).toContain('[Image: A lost photo]</w:t>');
  });

  test('a Word image keeps its share of the text width and its shape', async () => {
    const zip = await JSZip.loadAsync(await toDocx(photoDoc()));
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const sizes = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(sizes).toHaveLength(2);
    const [[w1 = 0, h1 = 0] = [], [w2 = 0, h2 = 0] = []] = sizes;
    expect(h1 / w1).toBeCloseTo(30 / 40, 2);
    expect(h2 / w2).toBeCloseTo(1, 2);
    expect(w1 / w2).toBeCloseTo(75 / 33, 1);
  });

  test('PDF draws each image that is on this device, with its caption and a line for the lost one', async () => {
    const bytes = (await toPdf(photoDoc(), { loadFile: loadPublicFile })).bytes;
    expect(await pdfImages(bytes)).toBe(2);
    if (!hasPoppler) return;
    const text = pdfText(bytes);
    expect(text).toContain('The harbour at dawn');
    expect(text).toContain('[Image: A lost photo]');
  });

  test('a PDF image keeps its share of the text width, and a tall one fits on the page', async () => {
    const options = { loadFile: loadPublicFile };
    // The text area of a Letter page is 468 by 648 points.
    const [first] = await drawnSizes((await toPdf(photoDoc(), options)).bytes);
    expect(first?.[0]).toBeCloseTo(468 * 0.75, 1);
    expect(first?.[1]).toBeCloseTo(468 * 0.75 * (30 / 40), 1);
    const tall = { ...IMAGES, harbour: { ...JPEG_IMAGE, height: 400 } };
    const [drawn] = await drawnSizes((await toPdf(photoDoc(tall), options)).bytes);
    expect(drawn?.[1]).toBeCloseTo(648 * 0.85, 1);
    expect(drawn?.[0]).toBeCloseTo((648 * 0.85 * 40) / 400, 1);
  });

  test('EPUB holds each image file, its alt text and its caption', async () => {
    const { bytes } = await toEpub(photoDoc(), {
      loadFile: loadPublicFile,
      id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
      modified: new Date('2026-11-12T10:00:00Z'),
    });
    const zip = await JSZip.loadAsync(bytes);
    expect(await zip.file('OEBPS/images/image-1.jpg')?.async('uint8array')).toEqual(JPEG);
    expect(await zip.file('OEBPS/images/image-2.png')?.async('uint8array')).toEqual(PNG);
    const opf = (await zip.file('OEBPS/content.opf')?.async('string')) ?? '';
    expect(opf).toContain('href="images/image-1.jpg" media-type="image/jpeg"');
    expect(opf).toContain('href="images/image-2.png" media-type="image/png"');
    const pages = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => name.endsWith('.xhtml'))
        .map((name) => zip.file(name)?.async('string') ?? Promise.resolve('')),
    );
    const html = pages.join('\n');
    expect(html).toContain('<img src="../images/image-1.jpg" alt="Boats in the harbour"/>');
    expect(html).toContain('<figcaption>The harbour at dawn</figcaption>');
    expect(html).toContain('<img src="../images/image-2.png" alt="" role="presentation"/>');
    expect(html).toContain('<p class="image-missing">[Image: A lost photo]</p>');
  });

  test('Markdown comes as a zip with an images folder when the text has an image', async () => {
    const { bytes, zip } = await markdownFile(photoDoc(), 'The Kettle');
    expect(zip).toBe(true);
    const files = await JSZip.loadAsync(bytes);
    expect(await files.file('images/image-1.jpg')?.async('uint8array')).toEqual(JPEG);
    expect(await files.file('images/image-2.png')?.async('uint8array')).toEqual(PNG);
    const text = (await files.file('The Kettle.md')?.async('string')) ?? '';
    expect(text).toContain('![Boats in the harbour](images/image-1.jpg)\\\n*The harbour at dawn*');
    expect(text).toContain('![](images/image-2.png)');
    expect(text).toContain('\\[Image: A lost photo\\]');
  });

  test('Markdown with no image on this device stays one text file', async () => {
    const { bytes, zip } = await markdownFile(photoDoc({}), 'The Kettle');
    expect(zip).toBe(false);
    expect(new TextDecoder().decode(bytes)).toBe(toMarkdown(photoDoc({})));
  });

  test('standard manuscript format writes "[Image: caption]" in Word and in PDF, with no image', async () => {
    const zip = await JSZip.loadAsync(await toDocx(photoDoc(), { manuscript: setup }));
    expect(Object.keys(zip.files).filter((name) => name.startsWith('word/media/'))).toEqual([]);
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(xml).toContain('[Image: The harbour at dawn]');
    expect(xml).toContain('[Image]');
    const pdf = (await toPdf(photoDoc(), { loadFile: loadPublicFile, manuscript: setup })).bytes;
    expect(await pdfImages(pdf)).toBe(0);
    if (hasPoppler) expect(pdfText(pdf)).toContain('[Image: The harbour at dawn]');
  });

  test('a web copy and a Fountain file name each image in a line', () => {
    const doc = photoDoc();
    expect(toWebHtml(doc)).toContain('<i>[Image: The harbour at dawn]</i>');
    expect(toWebText(doc)).toContain('[Image: The harbour at dawn]');
    expect(toFountain(doc)).toContain('[Image: A lost photo]');
  });

  test('the export notice names each image with no alt text and each lost image', () => {
    const doc = singleDoc(
      {
        type: 'doc',
        content: [
          image({ id: 'harbour', caption: 'Night boats' }),
          image({ id: 'seal' }),
          image({ id: 'gone', alt: 'Kept' }),
        ],
      },
      'prose',
    );
    const notices = exportNotices({ ...doc, images: IMAGES }, 'docx');
    expect(notices).toContain(
      'These images have no alt text: “Night boats” and image 2. A screen reader cannot say what they show. Select an image in Vlo and press Enter to add alt text, or mark it as decorative.',
    );
    expect(notices).toContain(
      'An image is not on this device, so the file has a line that names it in its place.',
    );
    expect(exportNotices({ ...doc, images: IMAGES }, 'markdown')).toContain(
      'The Markdown file and an “images” folder go in one zip file. Keep them together.',
    );
    expect(exportNotices(photoDoc(), 'web')).toContain(
      'Web editors get a line such as “[Image: caption]” in place of each image. The images stay in Vlo.',
    );
    // A decorative image needs no alt text.
    expect(exportNotices(photoDoc(), 'epub').join(' ')).not.toContain('alt text');
  });

  test('the walkaway zip keeps each image in one folder for the project', async () => {
    const backup: Backup = {
      createdAt: 0,
      project: {
        ...project('novel'),
        id: 'p',
        title: 'Salt Year',
        aiMode: 'pen',
        createdAt: 0,
        updatedAt: 0,
      },
      items: [item('c1', 'chapter', 'Chapter 1'), item('s1', 'scene', 'Harbour', 'c1')],
      snapshots: [],
      versions: [],
      authorship: [],
      sessions: [],
      itemTexts: [],
      updates: new Map([
        [
          's1',
          updateOf(
            { type: 'doc', content: [image({ id: 'harbour', alt: 'Boats in the harbour' })] },
            'prose',
          ),
        ],
      ]),
      music: [],
      research: [],
      images: [
        {
          info: {
            id: 'harbour',
            projectId: 'p',
            type: 'image/jpeg',
            size: JPEG.length,
            width: 40,
            height: 30,
            addedAt: 0,
          },
          data: JPEG.slice().buffer,
        },
      ],
      views: {} as Backup['views'],
    };
    const zip = await JSZip.loadAsync(await walkawayZip([backup]));
    expect(await zip.file('Salt Year/images/image-1.jpg')?.async('uint8array')).toEqual(JPEG);
    const scene = (await zip.file('Salt Year/01 Chapter 1/01 Harbour.md')?.async('string')) ?? '';
    expect(scene).toContain('![Boats in the harbour](../images/image-1.jpg)');
    const index = (await zip.file('Salt Year/index.html')?.async('string')) ?? '';
    expect(index).toContain('<img src="images/image-1.jpg" alt="Boats in the harbour">');
  });
});

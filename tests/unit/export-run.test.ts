import { describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { exportNotices } from '@/features/export/notices';
import { prepareExport, runExport, usesManuscript, type ExportRequest } from '@/features/export/run';
import {
  item,
  loadPublicFile,
  project,
  RICH_PROSE,
  singleDoc,
  updateOf,
  withFsType,
} from './export-fixtures';

/* One export from start to end (plan Task B2): the steps the export worker runs, and the notice for each format. */

const ownFontText = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Plain ' },
        { type: 'text', text: 'mine', marks: [{ type: 'textStyle', attrs: { font: 'local:Locked Hand' } }] },
      ],
    },
  ],
};

function request(format: ExportRequest['format'], extra: Partial<ExportRequest> = {}): ExportRequest {
  return {
    project: project('novel'),
    items: [item('s1', 'scene', 'Arrival')],
    scope: { kind: 'item', itemId: 's1' },
    updates: [['s1', updateOf(ownFontText, 'prose')]],
    format,
    people: [],
    shareSafe: false,
    ...extra,
  };
}

const details = { name: 'Ada Marlow', contact: '', typewriter: false };

describe('Export steps', () => {
  test('lists the own fonts only for the formats that embed fonts', () => {
    expect(prepareExport(request('pdf')).ownFonts).toEqual(['local:Locked Hand']);
    expect(prepareExport(request('epub')).ownFonts).toEqual(['local:Locked Hand']);
    expect(prepareExport(request('docx')).ownFonts).toEqual([]);
    expect(prepareExport(request('markdown')).ownFonts).toEqual([]);
  });

  test('uses standard manuscript format only for a novel in Word or PDF', () => {
    expect(usesManuscript(request('pdf', { manuscript: details }))).toBe(true);
    expect(usesManuscript(request('docx', { manuscript: details }))).toBe(true);
    expect(usesManuscript(request('epub', { manuscript: details }))).toBe(false);
    expect(usesManuscript(request('pdf'))).toBe(false);
    expect(usesManuscript(request('pdf', { manuscript: details, project: project('memoir') }))).toBe(false);
    // One font sets every word, so a font in the text needs no check.
    expect(prepareExport(request('pdf', { manuscript: details })).ownFonts).toEqual([]);
    expect(prepareExport(request('pdf', { manuscript: details })).manuscript?.words).toBe(2);
  });

  test('makes each format with its name, type and notices', async () => {
    const lora = await loadPublicFile('fonts/lora/regular.ttf');
    const fonts = new Map([['local:Locked Hand', withFsType(lora, 0x0002)]]);
    const make = (format: ExportRequest['format']) =>
      runExport(request(format), fonts, { loadFile: loadPublicFile });

    const pdf = await make('pdf');
    expect(pdf.name).toBe('Arrival.pdf');
    expect(pdf.type).toBe('application/pdf');
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe('%PDF-');
    expect(pdf.notices).toContain(
      'Locked Hand is not in the file. Its license does not allow embedding. The file uses Caveat in its place.',
    );

    const epub = await make('epub');
    expect(epub.name).toBe('Arrival.epub');
    expect(epub.type).toBe('application/epub+zip');
    expect(epub.notices[0]).toContain('Locked Hand is not in the file.');

    const docx = await make('docx');
    expect(docx.name).toBe('Arrival.docx');
    expect(docx.notices.join(' ')).toContain('The file names the fonts Newsreader and Locked Hand.');
    expect(docx.notices.join(' ')).not.toContain('is not in the file');

    const markdown = await make('markdown');
    expect(markdown.name).toBe('Arrival.md');
  }, 60_000);
});

describe('Export notices', () => {
  const rich = singleDoc(RICH_PROSE, 'prose');

  test('PDF names the sheen it drops and each style it draws', () => {
    expect(exportNotices(rich, 'pdf')).toEqual([
      'Shimmer moves only in Vlo. The file keeps each shimmering word still.',
      'Metallic and prismatic words keep their colors as a gradient, without the sheen.',
    ]);
    expect(
      exportNotices(rich, 'pdf', {
        drawnStyles: [
          { font: 'Cinzel', style: 'italic' },
          { font: 'Caveat', style: 'italic' },
          { font: 'IM Fell English', style: 'bold' },
        ],
      }).slice(2),
    ).toEqual([
      'Cinzel and Caveat have no italic. The PDF slants their upright letters.',
      'IM Fell English has no bold. The PDF thickens its letters.',
    ]);
  });

  test('EPUB says that e-readers set their own pages, and how gradients and equations show', () => {
    expect(exportNotices(rich, 'epub')).toEqual([
      'Shimmer moves only in Vlo. The file keeps each shimmering word still.',
      'Each e-reader sets its own page size, and many let the reader pick the font and text size. Line ends and pages differ from Vlo.',
      'An e-reader that cannot fill text with a gradient shows the first color of each gradient.',
      'Metallic and prismatic words keep their colors as a gradient, without the sheen.',
      'Equations are MathML. An e-reader without MathML shows their symbols in one line.',
    ]);
  });

  test('standard manuscript format says what it sets plain, and Word names its one font', () => {
    expect(exportNotices(rich, 'docx', { manuscriptFont: 'courier-prime' })).toEqual([
      'Standard manuscript format sets every word in one font and size, in black, with double spacing. Colors, highlights, sizes and alignment stay in Vlo.',
      'Shimmer moves only in Vlo. The file keeps each shimmering word still.',
      'The file names the font Courier Prime. A computer without it shows a similar font. Courier Prime is free from Google Fonts.',
    ]);
    const plain = buildExportDoc({
      project: project('novel'),
      items: [item('s1', 'scene', 'Arrival')],
      scope: { kind: 'item', itemId: 's1' },
      updates: new Map([
        [
          's1',
          updateOf(
            { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plain.' }] }] },
            'prose',
          ),
        ],
      ]),
    });
    expect(exportNotices(plain, 'pdf', { manuscriptFont: 'newsreader' })).toEqual([]);
  });
});

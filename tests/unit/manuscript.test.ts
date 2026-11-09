import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { toDocx } from '@/features/export/docx';
import {
  exportWords,
  headerText,
  plainDoc,
  roundedWords,
  shortTitle,
  surnameOf,
  type ManuscriptSetup,
} from '@/features/export/manuscript';
import { item, project, proseUpdate, RICH_PROSE, singleDoc } from './export-fixtures';

/* Standard manuscript format for novels (spec section 9, plan Task B7), in Word. The PDF checks are in pdf-export. */

const setup: ManuscriptSetup = {
  name: 'Ada Marlow',
  contact: '12 Quay Street\n\n  ada@example.org  ',
  typewriter: true,
  words: 2040,
};

function novel() {
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
      ['s1', proseUpdate(['The harbor lights came on one by one.', 'The boats came in.'])],
      ['s2', proseUpdate(['The gulls slept.'])],
    ]),
  });
}

describe('Manuscript helpers', () => {
  test('takes the surname and a short title for the page header', () => {
    expect(surnameOf('  Ada  Marlow ')).toBe('Marlow');
    expect(surnameOf('Prince')).toBe('Prince');
    expect(shortTitle('Salt Year')).toBe('SALT YEAR');
    expect(shortTitle('The Long and Winding Road Home')).toBe('THE LONG AND WINDING');
    expect(shortTitle('Incomprehensibilities Notwithstanding')).toBe('INCOMPREHENSIBILITIES');
    expect(headerText('Ada Marlow', 'Salt Year')).toBe('Marlow / SALT YEAR / ');
  });

  test('rounds the word count to the nearest 1,000, or to the nearest 100 for a short piece', () => {
    expect(roundedWords(2040, 'en')).toBe('about 2,000 words');
    expect(roundedWords(87_499, 'en')).toBe('about 87,000 words');
    expect(roundedWords(950, 'en')).toBe('about 1,000 words');
    expect(roundedWords(949, 'en')).toBe('about 900 words');
    expect(roundedWords(40, 'en')).toBe('about 100 words');
    expect(roundedWords(0, 'en')).toBe('about 100 words');
    // Chinese and Japanese manuscripts count characters (F38).
    expect(roundedWords(12_400, 'ja')).toBe('about 12,000 characters');
  });

  test('counts the words of the text, without folder titles or equations', () => {
    expect(exportWords(novel())).toBe(15);
    expect(exportWords(singleDoc(RICH_PROSE, 'prose'))).toBeGreaterThan(15);
  });

  test('sets every word in one font, in black, with no links, sizes or alignment', () => {
    const doc = plainDoc(singleDoc(RICH_PROSE, 'prose'), 'courier-prime');
    expect(doc.font).toBe('courier-prime');
    const paragraph = doc.sections[0]?.blocks.find((b) => b.type === 'paragraph');
    expect(paragraph?.type).toBe('paragraph');
    if (paragraph?.type !== 'paragraph') return;
    expect(paragraph.align).toBeUndefined();
    expect(paragraph.dropCap).toBeUndefined();
    expect(paragraph.lineSpacing).toBeUndefined();
    for (const run of paragraph.runs) {
      if (run.type !== 'text') continue;
      expect(
        Object.keys(run.style).every((k) =>
          ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript'].includes(k),
        ),
      ).toBe(true);
    }
    expect(paragraph.runs.some((r) => r.type === 'footnote')).toBe(true);
  });
});

describe('Standard manuscript format in Word', () => {
  test('writes the first page, the header with a page number, double spacing and chapters on new pages', async () => {
    const zip = await JSZip.loadAsync(await toDocx(novel(), { manuscript: setup }));
    const document = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const styles = (await zip.file('word/styles.xml')?.async('string')) ?? '';
    const headers = await Promise.all(
      Object.keys(zip.files)
        .filter((f) => /^word\/header\d+\.xml$/.test(f))
        .map(async (f) => (await zip.file(f)?.async('string')) ?? ''),
    );

    // Name, then the word count at the right tab stop, then each contact line.
    expect(document).toMatch(
      /<w:t xml:space="preserve">Ada Marlow<\/w:t>[\s\S]*<w:tab\/>[\s\S]*about 2,000 words/,
    );
    expect(document).toContain('12 Quay Street');
    expect(document).toContain('<w:t xml:space="preserve">ada@example.org</w:t>');
    expect(document).toContain('by Ada Marlow');
    // The first page has its own empty header, and numbering starts at 0 so the text starts at page 1.
    expect(document).toContain('<w:titlePg/>');
    expect(document).toContain('<w:pgNumType w:start="0"/>');
    const header = headers.find((h) => h.includes('Marlow / SALT YEAR / '));
    expect(header).toBeDefined();
    expect(header).toContain('PAGE');
    // Chapters start on a new page, a third of the way down the text area.
    expect(document.match(/<w:pageBreakBefore\/>/g)).toHaveLength(2);
    expect(document).toContain(`w:before="${String(Math.round((15840 - 2880) / 3))}"`);
    // Double spacing, indented first lines, Courier Prime, black, no bold chapter titles.
    expect(styles).toContain('w:line="480"');
    expect(document).toContain('<w:ind w:firstLine="720"/>');
    expect(styles).toContain('w:ascii="Courier Prime"');
    expect(styles).toContain('<w:color w:val="000000"/>');
  });

  test('keeps the project font when the typewriter look is off', async () => {
    const zip = await JSZip.loadAsync(await toDocx(novel(), { manuscript: { ...setup, typewriter: false } }));
    const styles = (await zip.file('word/styles.xml')?.async('string')) ?? '';
    expect(styles).toContain('w:ascii="Newsreader"');
    expect(styles).not.toContain('Courier Prime');
  });

  test('a single scene still starts on the page after the title page', async () => {
    const doc = buildExportDoc({
      project: project('novel'),
      items: [item('s1', 'scene', 'Arrival')],
      scope: { kind: 'item', itemId: 's1' },
      updates: new Map([['s1', proseUpdate(['One line.'])]]),
    });
    const zip = await JSZip.loadAsync(await toDocx(doc, { manuscript: setup }));
    const document = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(document).toContain('<w:br w:type="page"/>');
    expect(document.indexOf('<w:br w:type="page"/>')).toBeLessThan(document.indexOf('One line.'));
  });
});

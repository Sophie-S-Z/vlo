import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { toDocx } from '@/features/export/docx';
import { item, POEM_TEXT, poemUpdate, project, proseUpdate, RICH_PROSE, singleDoc } from './export-fixtures';

/*
 * The Word file opens in a second word processor (plan Task B3 to B6). LibreOffice reads each file by
 * script and writes it back as text and as OpenDocument. CI installs LibreOffice for this test and sets
 * VLO_REQUIRE_LIBREOFFICE, so a missing LibreOffice fails there.
 */

const hasLibreOffice = spawnSync('soffice', ['--version'], { encoding: 'utf8' }).status === 0;
const hasPoppler = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).status === 0;
if (process.env.VLO_REQUIRE_LIBREOFFICE === '1' && !hasLibreOffice) {
  throw new Error('This run needs LibreOffice (soffice), and it is not installed.');
}

const dir = mkdtempSync(join(tmpdir(), 'vlo-docx-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function convert(files: string[], to: string): void {
  execFileSync(
    'soffice',
    [
      `-env:UserInstallation=file://${join(dir, 'profile')}`,
      '--headless',
      '--convert-to',
      to,
      '--outdir',
      dir,
      ...files,
    ],
    { timeout: 120_000, stdio: 'ignore' },
  );
}

describe.runIf(hasLibreOffice)('Word export in LibreOffice', () => {
  test('LibreOffice opens the poem and the rich text, with every space and both equations', async () => {
    const poem = buildExportDoc({
      project: project('poetry'),
      items: [item('p1', 'poem', 'Salt on the Sill')],
      scope: { kind: 'item', itemId: 'p1' },
      updates: new Map([['p1', poemUpdate()]]),
    });
    writeFileSync(join(dir, 'poem.docx'), await toDocx(poem));
    writeFileSync(join(dir, 'rich.docx'), await toDocx(singleDoc(RICH_PROSE, 'prose')));
    convert([join(dir, 'poem.docx'), join(dir, 'rich.docx')], 'txt:Text (encoded):UTF8');
    convert([join(dir, 'rich.docx')], 'odt');

    const poemText = readFileSync(join(dir, 'poem.txt'), 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n');
    expect(poemText).toBe(`Salt on the Sill\n${POEM_TEXT}`);

    const richText = readFileSync(join(dir, 'rich.txt'), 'utf8');
    expect(richText).toContain('Once  the tide turned, gone H2O x2 rose marked big gold site bad');
    expect(richText).toContain('3. first');
    expect(richText).toContain('#');

    const odt = await JSZip.loadAsync(readFileSync(join(dir, 'rich.odt')));
    const formulas = await Promise.all(
      Object.keys(odt.files)
        .filter((name) => /^Object \d+\/content\.xml$/.test(name))
        .map(async (name) => (await odt.file(name)?.async('string')) ?? ''),
    );
    const starMath = formulas.map((xml) => /<annotation[^>]*>([^<]*)/.exec(xml)?.[1] ?? '');
    // LibreOffice reads the Word equations into its own formula language. It needs its Math module.
    expect(starMath).toEqual(expect.arrayContaining(['{a} over {b}', 'sum from {i = 1} to {n} {{i} ^ {2}}']));
  }, 180_000);

  test.runIf(hasPoppler)(
    'LibreOffice lays out standard manuscript format with its header and page numbers',
    async () => {
      const novel = buildExportDoc({
        project: project('novel', { authorName: 'Ada Marlow' }),
        items: [
          item('c1', 'chapter', 'Chapter One'),
          item('s1', 'scene', 'Arrival', 'c1'),
          item('c2', 'chapter', 'Chapter Two'),
          item('s2', 'scene', 'Night', 'c2'),
        ],
        scope: { kind: 'project' },
        updates: new Map([
          ['s1', proseUpdate(['The harbor lights came on one by one.'])],
          ['s2', proseUpdate(['The gulls slept.'])],
        ]),
      });
      const setup = { name: 'Ada Marlow', contact: '12 Quay Street', typewriter: true, words: 2040 };
      writeFileSync(join(dir, 'manuscript.docx'), await toDocx(novel, { manuscript: setup }));
      convert([join(dir, 'manuscript.docx')], 'pdf');
      const page = (n: number) =>
        execFileSync(
          'pdftotext',
          ['-f', String(n), '-l', String(n), '-layout', join(dir, 'manuscript.pdf'), '-'],
          {
            encoding: 'utf8',
          },
        );
      // The title page has no header. Each chapter starts a page, and the numbers start at 1 after the title page.
      expect(page(1)).toContain('about 2,000 words');
      expect(page(1)).toContain('by Ada Marlow');
      expect(page(1)).not.toContain('SALT YEAR');
      expect(page(2)).toMatch(/Marlow \/ SALT YEAR \/ 1\s/);
      expect(page(2)).toContain('Chapter One');
      expect(page(3)).toMatch(/Marlow \/ SALT YEAR \/ 2\s/);
      expect(page(3)).toContain('Chapter Two');
    },
    180_000,
  );
});

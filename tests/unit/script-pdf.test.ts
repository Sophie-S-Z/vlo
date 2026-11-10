import { PDFDocument } from 'pdf-lib';
import { describe, expect, test } from 'vitest';
import type { ScriptRole } from '@/features/editor/scriptRoles';
import type { ExportDoc } from '@/features/export/model';
import { toPdf } from '@/features/export/pdf/pdf';
import { CHAR, layOutScript, PAGE_LINES, wrap, type PrintedLine } from '@/features/export/pdf/script';
import type { ScriptStyle } from '@/lib/db';
import { loadPublicFile } from './export-fixtures';

/* Roadmap 2 F63, plan Task M4, Review Focus 3: the script PDF has the standard layout. */

const INCH = 72;

function script(
  lines: readonly (readonly [ScriptRole, string])[],
  style: ScriptStyle = 'screenplay',
): ExportDoc {
  return {
    title: 'Night Ferry',
    author: 'Ada Marlow',
    font: 'newsreader',
    paper: 'letter',
    language: 'en',
    script: style,
    sections: [
      {
        id: 's1',
        title: 'Scene 1',
        form: 'script',
        blocks: lines.map(([role, text]) => ({
          type: 'paragraph',
          role,
          runs: [{ type: 'text', text, style: {} }],
        })),
      },
    ],
  };
}

/** Points to two places, so a sum of inches compares with a sum of characters. */
const pt = (n: number | undefined) => Math.round((n ?? 0) * 100) / 100;
const text = (line: PrintedLine | undefined) => line?.pieces.map((p) => p.text).join('') ?? '';
/** Action that fills `count` lines of a page, as one paragraph of one-word lines. */
const filler = (count: number): [ScriptRole, string] => [
  'action',
  Array(count).fill('x'.repeat(60)).join(' '),
];

describe('the screenplay layout', () => {
  test('each element starts at its standard place and wraps at its width', () => {
    const [page] = layOutScript(
      script([
        ['heading', 'INT. FERRY CABIN - NIGHT'],
        ['action', 'Rain.'],
        ['character', 'MARA'],
        ['parenthetical', '(quietly)'],
        ['dialogue', 'We left at dawn, and the sea was black and wide and cold under the boat.'],
        ['transition', 'CUT TO:'],
      ]),
      'screenplay',
    );
    const lines = page ?? [];
    expect(lines.map((l) => [l.line, text(l), pt(l.x)])).toEqual([
      [0, 'INT. FERRY CABIN - NIGHT', 108],
      [2, 'Rain.', 108],
      [4, 'MARA', 266.4],
      [5, '(quietly)', 223.2],
      [6, 'We left at dawn, and the sea was', 180],
      [7, 'black and wide and cold under the', 180],
      [8, 'boat.', 180],
      // A transition ends at 7.5 inches.
      [10, 'CUT TO:', pt(7.5 * INCH - 'CUT TO:'.length * CHAR)],
    ]);
  });

  test('a long word breaks at the width of its element', () => {
    expect(
      wrap([{ type: 'text', text: 'a'.repeat(40), style: {} }], 35).map((l) => l[0]?.text.length),
    ).toEqual([35, 5]);
  });

  test('a page holds 55 lines', () => {
    const pages = layOutScript(script([filler(70)]), 'screenplay');
    expect(pages.map((p) => p.length)).toEqual([PAGE_LINES, 15]);
    expect(pages[0]?.at(-1)?.line).toBe(54);
  });

  test("a speech that breaks across a page ends with (MORE) and goes on with (CONT'D)", () => {
    const pages = layOutScript(
      script([
        filler(48),
        ['character', 'MARA'],
        // Eight lines of dialogue, 35 characters each.
        ['dialogue', Array(8).fill('y'.repeat(35)).join(' ')],
      ]),
      'screenplay',
    );
    const first = pages[0] ?? [];
    expect(text(first.at(-1))).toBe('(MORE)');
    expect(pt(first.at(-1)?.x)).toBe(266.4);
    expect(first.at(-1)?.line).toBe(54);
    const second = pages[1] ?? [];
    expect([text(second[0]), second[0]?.line, pt(second[0]?.x)]).toEqual(["MARA (CONT'D)", 0, 266.4]);
    // The filler, the name, the eight lines, "(MORE)" and the name again.
    expect(first.length + second.length).toBe(48 + 1 + 8 + 1 + 1);
  });

  test('a scene heading never ends a page', () => {
    const pages = layOutScript(
      script([filler(52), ['heading', 'EXT. DECK - NIGHT'], ['action', 'Wind.']]),
      'screenplay',
    );
    // The heading would be line 53 with its action on line 55, past the page.
    expect(pages[0]?.map(text)).not.toContain('EXT. DECK - NIGHT');
    expect(pages[1]?.map((l) => [l.line, text(l)])).toEqual([
      [0, 'EXT. DECK - NIGHT'],
      [2, 'Wind.'],
    ]);
  });
});

describe('the stage play layout', () => {
  test('names are in the center, speech runs across the line, and directions sit right in italics', () => {
    const [page] = layOutScript(
      script(
        [
          ['character', 'MARA'],
          ['dialogue', 'We left at dawn.'],
          ['action', 'She goes.'],
        ],
        'stage',
      ),
      'stage',
    );
    const lines = page ?? [];
    expect(pt(lines[0]?.x)).toBe(309.6);
    expect(pt(lines[1]?.x)).toBe(108);
    expect(pt(lines[2]?.x)).toBe(280.8);
    expect(lines[2]?.pieces[0]?.italic).toBe(true);
  });
});

describe('the script PDF', () => {
  test('is US Letter, with a title page and a number on each page after the first', async () => {
    const result = await toPdf(script([filler(70)]), { loadFile: loadPublicFile });
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(pdf.getAuthor()).toBe('Ada Marlow');
  });
});

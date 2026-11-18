import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Editor } from '@tiptap/core';
import { DOMParser as SchemaParser } from '@tiptap/pm/model';
import JSZip from 'jszip';
import * as Y from 'yjs';
import { afterAll, afterEach, describe, expect, test } from 'vitest';
import { runCommand } from '@/features/editor/commands/editorBus';
import { command } from '@/features/editor/commands/registry';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { cellPlace, hasHeaderRow } from '@/features/editor/extensions/table';
import { toDocx } from '@/features/export/docx';
import { toEpub } from '@/features/export/epub';
import { toMarkdown } from '@/features/export/markdown';
import type { ExportDoc, TableBlock } from '@/features/export/model';
import { exportNotices } from '@/features/export/notices';
import { toPdf } from '@/features/export/pdf/pdf';
import { toRtf } from '@/features/export/rtf';
import { toPlainText, toWebHtml } from '@/features/export/web';
import { readDocx } from '@/features/import/docx';
import { readHtml } from '@/features/import/html';
import { readMarkdown } from '@/features/import/markdown';
import { editorSchemas } from '@/features/import/tree';
import { toBundle } from '@/features/share/bundle';
import { shareSafe } from '@/lib/privacy';
import { loadPublicFile, singleDoc, TABLE_PROSE } from './export-fixtures';

/* Phase 19, Task F2: tables in the editor, in each export and in imports. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

const dir = mkdtempSync(join(tmpdir(), 'vlo-tables-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function proseEditor(html: string): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: proseExtensions(new Y.Doc()) });
  editors.push(editor);
  editor.commands.setContent(html);
  return editor;
}

const tableDoc = (): ExportDoc => singleDoc(TABLE_PROSE, 'prose');
const tableOf = (doc: ExportDoc) => doc.sections[0]?.blocks.find((b): b is TableBlock => b.type === 'table');

describe('the table in the editor', () => {
  test('Insert puts a table with a header row, and the tools act only in a table', () => {
    const editor = proseEditor('<p>Before</p>');
    expect(command('table-row-below').isEnabled?.(editor)).toBe(false);
    editor.chain().focus('end').insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run();
    expect(cellPlace(editor.state)).toEqual({ row: 1, column: 1, rows: 2, columns: 3 });
    expect(hasHeaderRow(editor.state)).toBe(true);
    expect(command('table-row-below').isEnabled?.(editor)).toBe(true);
    expect(command('table-header-row').isActive?.(editor)).toBe(true);
    expect(command('table-merge').isEnabled?.(editor)).toBe(false);

    expect(runCommand(editor, command('table-header-row'))).toBe(true);
    expect(hasHeaderRow(editor.state)).toBe(false);
  });

  test('Tab and Shift-Tab move between cells, and Tab in the last cell adds a row', () => {
    const editor = proseEditor('<p>Before</p>');
    editor.chain().focus('end').insertTable({ rows: 1, cols: 2, withHeaderRow: false }).run();
    const press = (key: string, shiftKey = false) => {
      editor.view.someProp('handleKeyDown', (f) =>
        f(editor.view, new KeyboardEvent('keydown', { key, shiftKey })),
      );
    };
    press('Tab');
    expect(cellPlace(editor.state)).toMatchObject({ row: 1, column: 2 });
    press('Tab');
    expect(cellPlace(editor.state)).toEqual({ row: 2, column: 1, rows: 2, columns: 2 });
    press('Tab', true);
    expect(cellPlace(editor.state)).toMatchObject({ row: 1, column: 2 });
  });

  test('two selected cells merge into one, and the merged cell splits again', () => {
    const editor = proseEditor(
      '<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td><td><p>D</p></td></tr></tbody></table>',
    );
    // The positions just before the first two cells.
    editor.commands.setCellSelection({ anchorCell: 2, headCell: 7 });
    expect(command('table-merge').isEnabled?.(editor)).toBe(true);
    editor.commands.mergeCells();
    const firstRow = () => editor.state.doc.firstChild?.firstChild;
    expect(firstRow()?.childCount).toBe(1);
    expect(firstRow()?.firstChild?.attrs.colspan).toBe(2);
    editor.commands.setTextSelection(4);
    expect(editor.commands.splitCell()).toBe(true);
    expect(firstRow()?.childCount).toBe(2);
  });

  test('a cell holds paragraphs only, so a pasted list in a cell becomes paragraphs', () => {
    const editor = proseEditor(
      '<table><tbody><tr><td><ul><li><p>One</p></li></ul></td></tr></tbody></table>',
    );
    const cell = editor.state.doc.firstChild?.firstChild?.firstChild;
    expect(cell?.content.content.map((n) => n.type.name)).toEqual(['paragraph']);
    expect(cell?.textContent).toBe('One');
  });
});

describe('the table in each export', () => {
  test('the export tree keeps the cells, the spans, the header and the column widths', () => {
    const table = tableOf(tableDoc());
    if (!table) throw new Error('The export has no table.');
    expect(table.rows.map((cells) => cells.map((c) => c.paragraphs[0]?.runs[0]))).toEqual([
      [
        { type: 'text', text: 'Name', style: {} },
        { type: 'text', text: 'Port', style: {} },
        { type: 'text', text: 'Tide', style: {} },
      ],
      [
        { type: 'text', text: 'Mira', style: {} },
        { type: 'text', text: 'Hull', style: {} },
      ],
      [
        { type: 'text', text: 'Leith', style: {} },
        { type: 'text', text: 'High', style: {} },
      ],
    ]);
    expect(table.rows[0]?.every((c) => c.header)).toBe(true);
    expect(table.rows[1]?.map((c) => [c.rowspan, c.colspan])).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(table.widths).toEqual([200 / 640, 220 / 640, 220 / 640]);
  });

  test('Word writes a table with its grid, its merged cells and a header row that repeats', async () => {
    const zip = await JSZip.loadAsync(await toDocx(tableDoc()));
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toContain('<w:gridSpan w:val="2"/>');
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml).toContain('<w:vMerge w:val="continue"/>');
    // 6.5 inches of text: 9360 twips, as 200, 220 and 220 parts of 640.
    expect([...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]))).toEqual([
      2925, 3218, 3218,
    ]);
    // Each cell has the width of the columns that it spans.
    const cellWidths = [
      ...xml.matchAll(/<w:tcW w:type="dxa" w:w="(\d+)"\/>|<w:tcW w:w="(\d+)" w:type="dxa"\/>/g),
    ].map((m) => Number(m[1] ?? m[2]));
    expect(cellWidths.length).toBeGreaterThan(0);
    for (const w of cellWidths) expect([2925, 3218, 6436, 6143]).toContain(w);
    // Header cells are bold.
    expect(/<w:tc>.*?<w:b\/>.*?Name/s.test(xml)).toBe(true);
  });

  test('EPUB writes an HTML table with a thead, a colgroup and the spans', async () => {
    const epub = await toEpub(tableDoc(), {
      loadFile: loadPublicFile,
      id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
      modified: new Date('2026-11-18T10:00:00Z'),
    });
    const zip = await JSZip.loadAsync(epub.bytes);
    const chapters = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => name.endsWith('.xhtml'))
        .map(async (name) => (await zip.file(name)?.async('string')) ?? ''),
    );
    const page = chapters.find((xhtml) => xhtml.includes('<table>')) ?? '';
    expect(page).toContain(
      '<table><colgroup><col style="width: 31.3%"/><col style="width: 34.4%"/><col style="width: 34.4%"/></colgroup><thead><tr><th><p>Name</p></th>',
    );
    expect(page).toContain('<td rowspan="2"><p>Mira</p></td><td colspan="2"><p>Hull</p></td>');
    expect(
      new DOMParser().parseFromString(page, 'application/xhtml+xml').querySelector('parsererror'),
    ).toBeNull();
  });

  test('Markdown writes a pipe table, and a merged cell keeps its text in its first place', () => {
    expect(toMarkdown(tableDoc())).toContain(
      ['| Name | Port | Tide |', '| --- | --- | --- |', '| Mira | Hull |  |', '|  | Leith | High |'].join(
        '\n',
      ),
    );
    expect(exportNotices(tableDoc(), 'markdown')).toContain(
      'Markdown has no merged cells. A merged cell keeps its text in its first place.',
    );
  });

  test('RTF writes rows with cell edges, a header row and a cell merged down', () => {
    const rtf = toRtf(tableDoc());
    expect(rtf).toContain('\\trowd\\trgaph108\\trleft0\\trhdr');
    expect(rtf).toContain('\\clvmgf');
    expect(rtf).toContain('\\clvmrg');
    expect(rtf.match(/\\row\n/g)).toHaveLength(3);
    expect(rtf).toContain('{{\\b Name}}\\cell');
  });

  test('the web copy keeps the table, and plain text puts each row on one line', () => {
    expect(toWebHtml(tableDoc())).toContain(
      '<table><thead><tr><th><p>Name</p></th><th><p>Port</p></th><th><p>Tide</p></th></tr></thead><tbody><tr><td rowspan="2"><p>Mira</p></td>',
    );
    const text = toPlainText(tableDoc());
    expect(text).toContain('Name | Port | Tide\nMira | Hull\nLeith | High');
    expect(exportNotices(tableDoc(), 'text')).toContain(
      'A plain text file has no tables. Each table row is one line, with “|” between its cells.',
    );
  });

  test('a private name in a cell gets its alias, and the share copy reads a row as one line', () => {
    const people = [{ id: 'mira', variants: [{ real: 'Mira', alias: 'Nell' }] }];
    const safe = shareSafe(tableDoc(), people, true);
    expect(tableOf(safe)?.rows[1]?.[0]?.paragraphs[0]?.runs[0]).toMatchObject({ text: 'Nell' });
    const bundle = toBundle(safe, () => '', 0);
    const lines = bundle.sections[0]?.blocks.map((b) =>
      b.type === 'p' ? b.runs.map((r) => ('t' in r ? r.t : '')).join('') : '',
    );
    expect(lines).toContain('Nell | Hull');
  });

  const hasPoppler = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).status === 0;
  test.runIf(hasPoppler)('the PDF draws the cells in their columns, with a cell merged down', async () => {
    const path = join(dir, 'table.pdf');
    writeFileSync(path, (await toPdf(tableDoc(), { loadFile: loadPublicFile })).bytes);
    const html = execFileSync('pdftotext', ['-bbox', path, '-'], { encoding: 'utf8' });
    const at = (word: string) => {
      const m = new RegExp(`<word xMin="([\\d.]+)" yMin="([\\d.]+)"[^>]*>${word}</word>`).exec(html);
      return { x: Number(m?.[1]), y: Number(m?.[2]) };
    };
    const [name, port, mira, hull, leith] = ['Name', 'Port', 'Mira', 'Hull', 'Leith'].map(at);
    expect(mira?.x).toBeCloseTo(name?.x ?? 0, 0);
    expect(hull?.x).toBeCloseTo(port?.x ?? 0, 0);
    expect(leith?.x).toBeCloseTo(port?.x ?? 0, 0);
    expect(hull?.y).toBeGreaterThan(name?.y ?? 0);
    expect(leith?.y).toBeGreaterThan(hull?.y ?? 0);
    // The first column is 200 of 640 parts of the 468 pt text width.
    expect((port?.x ?? 0) - (name?.x ?? 0)).toBeCloseTo((468 * 200) / 640, 0);
  });
});

test('a row that merged cells cover goes, and the cells above stop spanning it', () => {
  const cell = (text: string, rowspan = 1) => ({
    type: 'tableCell',
    attrs: { colspan: 1, rowspan, colwidth: null },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  const doc = singleDoc(
    {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [cell('Mira', 2), cell('Hull', 2)] },
            { type: 'tableRow', content: [] },
            { type: 'tableRow', content: [cell('Leith'), cell('High')] },
          ],
        },
      ],
    },
    'prose',
  );
  const table = tableOf(doc);
  expect(table?.rows.map((cells) => cells.map((c) => c.rowspan))).toEqual([
    [1, 1],
    [1, 1],
  ]);
});

describe('a table in an import', () => {
  test('a Word row of merged cells only leaves the next row in its place', async () => {
    const { Document, Packer, Paragraph, Table, TableCell, TableRow, VerticalMergeType } =
      await import('docx');
    const cell = (text: string, merge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType]) =>
      new TableCell({ children: [new Paragraph(text)], ...(merge ? { verticalMerge: merge } : {}) });
    const word = new Document({
      sections: [
        {
          children: [
            new Table({
              rows: [
                new TableRow({
                  children: [
                    cell('Mira', VerticalMergeType.RESTART),
                    cell('Hull', VerticalMergeType.RESTART),
                  ],
                }),
                new TableRow({
                  children: [cell('', VerticalMergeType.CONTINUE), cell('', VerticalMergeType.CONTINUE)],
                }),
                new TableRow({ children: [cell('Leith'), cell('High')] }),
              ],
            }),
          ],
        },
      ],
    });
    const { nodes } = await readDocx('merged.docx', new Uint8Array(await Packer.toArrayBuffer(word)));
    expect(nodes[0]?.text?.html).toContain(
      '<tbody><tr><td><p>Mira</p></td><td><p>Hull</p></td></tr><tr><td><p>Leith</p></td><td><p>High</p></td></tr></tbody>',
    );
  });

  test("Vlo's Word table comes back with its header row and its merged cells", async () => {
    const { nodes, skipped } = await readDocx('crew.docx', await toDocx(tableDoc()));
    expect(skipped).toEqual([]);
    expect(nodes[0]?.text?.html).toContain(
      '<table><tbody><tr><th><p><strong>Name</strong></p></th><th><p><strong>Port</strong></p></th><th><p><strong>Tide</strong></p></th></tr><tr><td rowspan="2"><p>Mira</p></td><td colspan="2"><p>Hull</p></td></tr><tr><td><p>Leith</p></td><td><p>High</p></td></tr></tbody></table>',
    );
  });

  test('a web page keeps its table', () => {
    const { nodes, skipped } = readHtml(
      'crew.html',
      '<html><body><p>The crew.</p><table><tr><th>Name</th></tr><tr><td>Mira</td></tr></table></body></html>',
    );
    expect(skipped).toEqual([]);
    expect(nodes[0]?.text?.html).toContain(
      '<table><tbody><tr><th>Name</th></tr><tr><td>Mira</td></tr></tbody></table>',
    );
  });

  test("Vlo's Markdown table comes back as a table, with its header row and its cells", () => {
    const [node] = readMarkdown('crew.md', toMarkdown(tableDoc()));
    const body = new DOMParser().parseFromString(node?.text?.html ?? '', 'text/html').body;
    const doc = SchemaParser.fromSchema(editorSchemas.prose).parse(body);
    const table = doc.content.content.find((n) => n.type.name === 'table');
    expect(table?.childCount).toBe(3);
    const rows = table?.content.content.map((row) =>
      row.content.content.map((c) => [c.type.name, c.textContent]),
    );
    expect(rows?.[0]).toEqual([
      ['tableHeader', 'Name'],
      ['tableHeader', 'Port'],
      ['tableHeader', 'Tide'],
    ]);
    expect(rows?.[1]).toEqual([
      ['tableCell', 'Mira'],
      ['tableCell', 'Hull'],
      ['tableCell', ''],
    ]);
  });
});

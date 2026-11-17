import { Editor, type JSONContent } from '@tiptap/core';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { pageBreaks } from '@/features/editor/format/page';
import { toDocx } from '@/features/export/docx';
import { mathmlFor } from '@/features/export/latex';
import { toMarkdown } from '@/features/export/markdown';
import { toPdf } from '@/features/export/pdf/pdf';
import { toRtf } from '@/features/export/rtf';
import { toPlainText, toWebHtml } from '@/features/export/web';
import { readMarkdown } from '@/features/import/markdown';
import { parseBundle, toBundle } from '@/features/share/bundle';
import { loadPublicFile, singleDoc } from './export-fixtures';

/* Phase 19, Part B. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

function editorOn(content: string): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: proseExtensions(new Y.Doc()) });
  editor.commands.setContent(content);
  editors.push(editor);
  return editor;
}

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const task = (text: string, checked: boolean) => ({
  type: 'taskItem',
  attrs: { checked },
  content: [para(text)],
});

/** A memory with a Heading 4, a checklist, a page break and a last paragraph. */
const B5_DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Packing' }] },
    { type: 'taskList', content: [task('Rope', true), task('Lantern', false)] },
    { type: 'pageBreak' },
    para('The boat left at dawn.'),
  ],
};

describe('checklists, page breaks and Heading 4 (Task B5)', () => {
  test('the editor makes each one, and the page break has its own key', () => {
    const editor = editorOn('<p>Rope</p>');
    editor.commands.toggleTaskList();
    expect(editor.getJSON().content[0]?.type).toBe('taskList');
    editor.commands.toggleHeading({ level: 4 });
    expect(editor.isActive('heading', { level: 4 })).toBe(true);

    const other = editorOn('<p>The end of the chapter.</p>');
    other.commands.focus('end');
    other.commands.keyboardShortcut('Mod-Enter');
    expect(other.getJSON().content.map((n) => n.type)).toEqual(['paragraph', 'pageBreak', 'paragraph']);
  });

  test('a Word, Google Docs or Markdown page break comes in as one, and its text never goes', () => {
    const editor = editorOn(
      '<p>One</p><br style="page-break-before: always" clear="all"><p>Two</p>' +
        '<hr style="page-break-before:always"><div style="break-after: page"></div>' +
        '<div style="page-break-after: always">Kept</div>',
    );
    const types = editor.getJSON().content.map((n) => n.type);
    expect(types.filter((t) => t === 'pageBreak')).toHaveLength(3);
    expect(editor.getText()).toContain('Kept');
  });

  test('Markdown writes "- [x]" and the page break, and its import reads both back', () => {
    const markdown = toMarkdown(singleDoc(B5_DOC, 'prose'));
    expect(markdown).toContain('- [x] Rope\n- [ ] Lantern');
    expect(markdown).toContain('<div style="page-break-after: always"></div>');

    const [node] = readMarkdown('Packing.md', markdown);
    const editor = editorOn(node?.text?.html ?? '');
    const json: JSONContent = editor.getJSON();
    const list = json.content?.find((n) => n.type === 'taskList');
    expect(list?.content?.map((n) => (n.attrs as { checked?: boolean } | undefined)?.checked)).toEqual([
      true,
      false,
    ]);
    expect(json.content?.some((n) => n.type === 'pageBreak')).toBe(true);
  });

  test('Word has a box for each item, the Heading 5 style and a real page break', async () => {
    const zip = await JSZip.loadAsync(await toDocx(singleDoc(B5_DOC, 'prose')));
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(xml).toContain('☑ </w:t>');
    expect(xml).toContain('☐ </w:t>');
    expect(xml).toContain('<w:pStyle w:val="Heading5"/>');
    expect(xml).toContain('<w:br w:type="page"/>');
  });

  test('RTF, plain text and web copies show the boxes, and only RTF has the page', () => {
    const doc = singleDoc(B5_DOC, 'prose');
    const rtf = toRtf(doc);
    expect(rtf).toContain('\\u9745?');
    expect(rtf).toContain('\\u9744?');
    expect(rtf).toContain('\\page');
    expect(toPlainText(doc)).toContain('☑ Rope\n☐ Lantern');
    const html = toWebHtml(doc);
    expect(html).toContain('<li><p>☑ Rope</p></li>');
    expect(html).not.toContain('page-break');
  });

  test('the PDF starts a new page at the break, and draws the boxes', async () => {
    const pages = async (json: typeof B5_DOC) =>
      (
        await PDFDocument.load((await toPdf(singleDoc(json, 'prose'), { loadFile: loadPublicFile })).bytes)
      ).getPageCount();
    const without = { ...B5_DOC, content: B5_DOC.content.filter((n) => n.type !== 'pageBreak') };
    expect(await pages(without)).toBe(1);
    expect(await pages(B5_DOC)).toBe(2);
  });

  test('a share link keeps the boxes and leaves out the page break', async () => {
    const doc = singleDoc(B5_DOC, 'prose');
    const bundle = parseBundle(JSON.parse(JSON.stringify(toBundle(doc, await mathmlFor(doc), 1))) as unknown);
    const blocks = bundle?.sections[0]?.blocks ?? [];
    // The item title, the Heading 4, the checklist and the paragraph.
    expect(blocks.map((b) => b.type)).toEqual(['h', 'h', 'list', 'p']);
    expect(JSON.stringify(blocks[2])).toContain('☑ ');
  });

  test('the page view ends a page at a page break', () => {
    const blocks = [
      { top: 0, bottom: 100, line: 20 },
      { top: 110, bottom: 120, line: null, breakAfter: true },
      { top: 130, bottom: 200, line: 20 },
    ];
    expect(pageBreaks(blocks, 1000)).toEqual([120]);
  });
});

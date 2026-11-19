import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Editor, type JSONContent } from '@tiptap/core';
import JSZip from 'jszip';
import * as Y from 'yjs';
import { afterAll, afterEach, describe, expect, test } from 'vitest';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import { command } from '@/features/editor/commands/registry';
import { proseExtensions } from '@/features/editor/extensions/prose';
import {
  cleanParagraphStyles,
  DEFAULT_PARAGRAPH_STYLES,
  styleSheet,
  stylesOf,
  type ParagraphStyle,
} from '@/features/editor/format/paragraphStyles';
import { getParagraphStyles, openParagraphStyles } from '@/features/editor/format/paragraphStyleStore';
import { styleAt, updateStyleToMatch } from '@/features/editor/paragraphStyleTools';
import { buildExportDoc } from '@/features/export/build';
import { toDocx } from '@/features/export/docx';
import { toEpub } from '@/features/export/epub';
import { exportNotices } from '@/features/export/notices';
import { toPdf } from '@/features/export/pdf/pdf';
import { updateToJson } from '@/features/export/read';
import { createProject, updateProjectSettings } from '@/features/library/projects';
import { db } from '@/lib/db';
import { readItemUpdate, writeItemUpdate } from '@/lib/ydocs';
import { item, loadPublicFile, project, updateOf } from './export-fixtures';

/* Phase 19, Task E2: paragraph styles with names. */

const dir = mkdtempSync(join(tmpdir(), 'vlo-style-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  openParagraphStyles(null, undefined);
});

function proseEditor(html: string): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: proseExtensions(new Y.Doc()) });
  editors.push(editor);
  editor.commands.setContent(html);
  return editor;
}

const paragraph = (text: string, styleId?: string): JSONContent => ({
  type: 'paragraph',
  ...(styleId ? { attrs: { styleId } } : {}),
  content: [{ type: 'text', text }],
});

/** A memoir of one memory: a body paragraph, a letter, a text message and a body paragraph. */
function styledDoc(styles?: ParagraphStyle[]) {
  const json: JSONContent = {
    type: 'doc',
    content: [
      paragraph('Plain words first.'),
      paragraph('Dear Ada, the tide came in.', 'letter'),
      {
        ...paragraph('See you at nine', 'text-message'),
        attrs: { styleId: 'text-message', textAlign: 'right' },
      },
      paragraph('Plain words last.'),
    ],
  };
  return buildExportDoc({
    project: project('memoir', styles ? { settings: { paragraphStyles: styles } } : {}),
    items: [item('i1', 'memory', 'The Kettle')],
    scope: { kind: 'item', itemId: 'i1' },
    updates: new Map([['i1', updateOf(json, 'prose')]]),
  });
}

describe('the stored styles', () => {
  test('keep each good style once, and a project with none has the five default styles', () => {
    expect(
      cleanParagraphStyles([
        { id: 'letter', name: ' Letter ', indent: 2, italic: true },
        { id: 'letter', name: 'Second letter' },
        { id: 'Bad id', name: 'Bad' },
        { id: 'big', name: 'Big', size: 9 },
        { id: 'odd', name: 'Odd', align: 'middle' },
        { id: 'no-name', name: '  ' },
      ]),
    ).toEqual([{ id: 'letter', name: 'Letter', indent: 2, italic: true }]);
    expect(cleanParagraphStyles('damaged')).toBeNull();
    expect(stylesOf(undefined).map((s) => s.name)).toEqual([
      'Epigraph',
      'Letter',
      'Text message',
      'Song lyrics',
      'Sign',
    ]);
    expect(stylesOf([])).toEqual([]);
  });

  test('the style sheet gives each style one rule, with margins in em of the text size', () => {
    const css = styleSheet(
      [
        { id: 'small', name: 'Small', size: 0.8, indent: 2, before: 1, italic: true, align: 'center' },
        { id: 'empty', name: 'Empty' },
      ],
      '.vlo-prose',
    );
    expect(css).toBe(
      ".vlo-prose p[data-style='small'] { font-size: 0.8em; text-align: center; margin-inline-start: 2.5em; margin-top: 1.25em; font-style: italic; }",
    );
  });
});

describe('in the editor', () => {
  test('a style goes on each selected paragraph, a heading becomes a paragraph, and a list stays a list', () => {
    const editor = proseEditor('<h2>Salt</h2><ul><li><p>One</p></li></ul>');
    editor.commands.setTextSelection(2);
    editor.commands.setParagraphStyle('letter');
    expect(editor.getHTML()).toContain('<p data-style="letter">Salt</p>');
    let one = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.text === 'One') one = pos;
    });
    editor.commands.setTextSelection(one);
    editor.commands.setParagraphStyle('sign');
    expect(editor.getHTML()).toContain('<ul><li><p data-style="sign">One</p></li></ul>');
    // Body text takes the style off.
    expect(editor.isActive('paragraph', { styleId: 'sign' })).toBe(true);
    expect(command('paragraph').isActive?.(editor)).toBe(false);
  });

  test('the Body text key takes the style off, as the menu does', () => {
    const editor = proseEditor('<p data-style="letter">Salt</p>');
    editor.commands.setTextSelection(2);
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: '0', code: 'Digit0', ctrlKey: true, altKey: true, bubbles: true }),
    );
    expect(editor.getHTML()).toBe('<p>Salt</p>');
  });

  test('Update the style to match takes the paragraph’s own formats into its style', () => {
    openParagraphStyles(null, undefined);
    const editor = proseEditor(
      '<p data-style="letter" style="text-align: center"><em>Dear Ada</em></p><p data-style="letter">Yours</p>',
    );
    editor.commands.setTextSelection(3);
    expect(styleAt(editor)?.name).toBe('Letter');
    expect(command('style-update').isEnabled?.(editor)).toBe(true);
    expect(updateStyleToMatch(editor)).toBe(true);
    expect(getParagraphStyles().find((s) => s.id === 'letter')).toEqual({
      ...DEFAULT_PARAGRAPH_STYLES[1],
      align: 'center',
      italic: true,
    });
    // The paragraph now shows its style, so both letter paragraphs look the same.
    expect(editor.getHTML()).toBe('<p data-style="letter">Dear Ada</p><p data-style="letter">Yours</p>');
    // A paragraph with no style has nothing to update.
    editor.commands.setContent('<p>Plain</p>');
    expect(command('style-update').isEnabled?.(editor)).toBe(false);
  });
});

describe('exports', () => {
  test('the export tree keeps the style of each paragraph and the styles of the project', () => {
    const doc = styledDoc();
    const blocks = doc.sections[0]?.blocks ?? [];
    const paragraphs = blocks.filter((b) => b.type === 'paragraph');
    expect(paragraphs.map((b) => b.style ?? null)).toEqual([null, 'letter', 'text-message', null]);
    expect(doc.styles).toEqual(DEFAULT_PARAGRAPH_STYLES);
    expect(exportNotices(doc, 'markdown').join(' ')).toMatch(/layout|alignment|indent/i);
  });

  test('Word gets real paragraph styles, and a paragraph’s own alignment wins over its style', async () => {
    const zip = await JSZip.loadAsync(await toDocx(styledDoc()));
    const styles = (await zip.file('word/styles.xml')?.async('string')) ?? '';
    const document = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const letter = /<w:style [^>]*w:styleId="VloStyle-letter"[\s\S]*?<\/w:style>/.exec(styles)?.[0] ?? '';
    expect(letter).toContain('<w:name w:val="Letter"/>');
    expect(letter).toContain('<w:basedOn w:val="Normal"/>');
    expect(letter).toMatch(/<w:ind w:left="480"\/>/);
    expect(letter).toMatch(/<w:spacing (?=[^>]*w:before="120")(?=[^>]*w:after="120")[^>]*\/>/);
    const message = /<w:style [^>]*w:styleId="VloStyle-text-message"[\s\S]*?<\/w:style>/.exec(styles)?.[0];
    expect(message).toContain('w:ascii="Inter"');
    expect(message).toContain('<w:sz w:val="22"/>');
    expect(document).toMatch(/<w:pStyle w:val="VloStyle-letter"\/>[\s\S]*?Dear Ada/);
    expect(document).toMatch(/<w:pStyle w:val="VloStyle-text-message"\/><w:jc w:val="right"\/>/);
    // A style that the project deleted leaves body text.
    const gone = await JSZip.loadAsync(await toDocx(styledDoc([])));
    expect(await gone.file('word/document.xml')?.async('string')).not.toContain('VloStyle-');
  });

  test('EPUB writes the style values on each paragraph and takes the style’s font', async () => {
    const zip = await JSZip.loadAsync(
      (
        await toEpub(styledDoc(), {
          loadFile: loadPublicFile,
          id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
          modified: new Date('2026-11-18T10:00:00Z'),
        })
      ).bytes,
    );
    const chapter = Object.keys(zip.files).find(
      (name) => /text\/.*\.xhtml$/.test(name) && !name.endsWith('nav.xhtml'),
    );
    const html = (await zip.file(chapter ?? '')?.async('string')) ?? '';
    expect(html).toContain(
      '<p style="margin-inline-start: 2em; margin-top: 0.5em; margin-bottom: 0.5em">Dear Ada, the tide came in.</p>',
    );
    expect(html).toContain(
      "<p style=\"text-align: right; font-family: 'Vlo Inter', sans-serif; font-size: 0.9em; margin-inline-start: 2.222em;",
    );
    expect(Object.keys(zip.files).some((name) => name.includes('inter'))).toBe(true);
  });

  // Poppler reads the PDF. CI installs it, and the PDF export tests fail there without it.
  const hasPoppler = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).status === 0;
  test.runIf(hasPoppler)(
    'PDF sets the letter in from the margin and draws the text message in its own font',
    async () => {
      const path = join(dir, 'styled.pdf');
      writeFileSync(path, (await toPdf(styledDoc(), { loadFile: loadPublicFile })).bytes);
      const box = execFileSync('pdftotext', ['-bbox', path, '-'], { encoding: 'utf8' });
      const xOf = (word: string) =>
        Number(new RegExp(`<word xMin="([\\d.]+)"[^>]*>${word}</word>`).exec(box)?.[1] ?? Number.NaN);
      // 2 em of 12 pt text.
      expect(xOf('Dear') - xOf('Plain')).toBeCloseTo(24, 0);
      const fonts = execFileSync('pdffonts', [path], { encoding: 'utf8' });
      expect(fonts).toMatch(/Inter/);
    },
  );

  test.runIf(hasPoppler)(
    'PDF: the space after a quote’s last paragraph does not move the quote’s first line',
    async () => {
      const gapAbove = async (lastStyle?: string) => {
        const json: JSONContent = {
          type: 'doc',
          content: [
            paragraph('Above.'),
            { type: 'blockquote', content: [paragraph('Inside.'), paragraph('Closing.', lastStyle)] },
          ],
        };
        const doc = buildExportDoc({
          project: project('memoir'),
          items: [item('i1', 'memory', 'The Kettle')],
          scope: { kind: 'item', itemId: 'i1' },
          updates: new Map([['i1', updateOf(json, 'prose')]]),
        });
        const path = join(dir, 'quote.pdf');
        writeFileSync(path, (await toPdf(doc, { loadFile: loadPublicFile })).bytes);
        const box = execFileSync('pdftotext', ['-bbox', path, '-'], { encoding: 'utf8' });
        const yOf = (word: string) =>
          Number(new RegExp(`<word [^>]*yMin="([\\d.]+)"[^>]*>${word}</word>`).exec(box)?.[1] ?? Number.NaN);
        return yOf('Inside.') - yOf('Above.');
      };
      expect(await gapAbove('epigraph')).toBeCloseTo(await gapAbove(), 1);
    },
  );
});

describe('backup', () => {
  test('a backup keeps the styles and each paragraph’s style, and refuses a damaged style', async () => {
    await db.open();
    try {
      const { project: made } = await createProject({ title: 'Salt Year', templates: ['memoir'] });
      const own: ParagraphStyle[] = [{ id: 's-1a2b3c4d', name: 'Diary', italic: true, indent: 1 }];
      await updateProjectSettings(made.id, { paragraphStyles: own });
      const memory = (await db.items.where('projectId').equals(made.id).toArray()).find(
        (i) => i.kind === 'memory',
      );
      if (!memory) throw new Error('The memoir has no memory.');
      await writeItemUpdate(
        memory.id,
        updateOf({ type: 'doc', content: [paragraph('Monday.', 's-1a2b3c4d')] }, 'prose'),
        1,
      );
      const { bytes } = await backUpProject(made.id, { music: false });
      const backup = await readBackup(bytes);
      expect(backup.project.settings.paragraphStyles).toEqual(own);

      const copyId = await importBackup(backup, 'copy');
      expect((await db.projects.get(copyId))?.settings.paragraphStyles).toEqual(own);
      const copied = (await db.items.where('projectId').equals(copyId).toArray()).find(
        (i) => i.kind === 'memory',
      );
      const update = await readItemUpdate(copied?.id ?? '');
      expect(JSON.stringify(updateToJson(update))).toContain('"styleId":"s-1a2b3c4d"');

      const zip = await JSZip.loadAsync(bytes);
      const manifest = JSON.parse((await zip.file('project.json')?.async('string')) ?? '{}') as {
        project: { settings: Record<string, unknown> };
      };
      manifest.project.settings.paragraphStyles = [{ id: 'Bad id', name: 'Diary' }];
      zip.file('project.json', JSON.stringify(manifest));
      await expect(readBackup(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
        'The project settings are wrong.',
      );
    } finally {
      await db.delete();
    }
  });
});

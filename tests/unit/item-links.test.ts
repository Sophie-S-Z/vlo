import { Editor, type JSONContent } from '@tiptap/core';
import JSZip from 'jszip';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import * as Y from 'yjs';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import { addItem } from '@/features/binder/items';
import {
  insertLink,
  linkChoices,
  linkMenuKey,
  unlink,
  type LinkChoice,
} from '@/features/editor/extensions/itemLink';
import { insertMention } from '@/features/editor/extensions/codexCompletion';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { chooseFromMenu } from '@/features/editor/extensions/slashMenu';
import { ITEM_LINK, linkIndexOf } from '@/features/editor/format/itemLink';
import { docParts, writeItemText } from '@/features/editor/itemText';
import { buildExportDoc, type ExportScope } from '@/features/export/build';
import { toDocx } from '@/features/export/docx';
import { toEpub } from '@/features/export/epub';
import { runsOf, type Run } from '@/features/export/model';
import { toPdf } from '@/features/export/pdf/pdf';
import { updateToJson } from '@/features/export/read';
import { createProject } from '@/features/library/projects';
import {
  followLink,
  getLinks,
  linksTo,
  noteLinkIndex,
  openLinks,
  setLinkItems,
  setLinkOpener,
  takeLinkAnchor,
} from '@/features/links/linkStore';
import { db } from '@/lib/db';
import { readItemUpdate, writeItemUpdate } from '@/lib/ydocs';
import { item, loadPublicFile, project, updateOf } from './export-fixtures';

/* Phase 19, Task F1: links between items, and backlinks. */

// jsdom draws no layout, and a go-to measures the caret to scroll it into view.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

const editors: Editor[] = [];
afterEach(async () => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  setLinkOpener(null);
  await openLinks(null);
});

function proseEditor(itemId: string, html: string): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: proseExtensions(new Y.Doc(), { itemId, listId: `links-${itemId}` }),
  });
  editors.push(editor);
  editor.commands.setContent(html);
  return editor;
}

/** The link store of a project of three items: The Kettle, Salt with its heading, and The Dock. */
async function openProject() {
  await openLinks('p1');
  setLinkItems([
    { id: 'i1', title: 'The Kettle' },
    { id: 'i2', title: 'Salt' },
    { id: 'i3', title: 'The Dock' },
  ]);
  noteLinkIndex('p1', 'i2', { links: [], headings: [{ text: 'The storm' }] });
}

const linkNode = (editor: Editor) => {
  let found: JSONContent | undefined;
  editor.state.doc.descendants((node) => {
    if (node.type.name === ITEM_LINK) found = node.toJSON() as JSONContent;
  });
  return found;
};

describe('in the editor', () => {
  test('[[ lists the items and their headings, and a heading link gives the heading its anchor', async () => {
    await openProject();
    const target = proseEditor('i2', '<h2>The storm</h2><p>Rain.</p>');
    const editor = proseEditor('i1', '<p>See it</p>');
    editor.commands.setTextSelection(5);
    editor.commands.openLinkList();
    editor.commands.insertContent('sto');
    const menu = linkMenuKey.getState(editor.state);
    expect(menu?.matches).toEqual<LinkChoice[]>([
      { item: 'i2', title: 'Salt', heading: { text: 'The storm', index: 0 } },
    ]);
    const choice = menu?.matches[0];
    if (!menu || !choice) throw new Error('The list is empty.');
    chooseFromMenu(editor.view, linkMenuKey, menu, choice, (c) => {
      insertLink(editor, c);
    });
    const link = linkNode(editor);
    expect(link?.attrs).toMatchObject({ item: 'i2', label: 'Salt › The storm' });
    const anchor = String(link?.attrs?.heading);
    expect(anchor).toMatch(/^h-[a-z0-9]{8}$/);
    // The open editor of the target gives its heading the anchor.
    await vi.waitFor(() => {
      expect(target.state.doc.firstChild?.attrs.anchor).toBe(anchor);
    });
    expect(editor.getText()).toBe('See Salt › The storm it');
    expect(linkIndexOf(editor.state.doc).links).toEqual(['i2']);
    // An item title matches too, and "@" on an item makes the same link.
    expect(linkChoices('kett').map((c) => c.title)).toEqual(['The Kettle']);
    editor.commands.setContent('<p></p>');
    insertMention(editor, { id: 'i3', name: 'The Dock', kind: 'Item', item: true });
    expect(linkNode(editor)?.attrs).toMatchObject({ item: 'i3', label: 'The Dock' });
  });

  test('a link shows the current title, a deleted item gives a quiet broken link, and Remove link keeps the words', async () => {
    await openProject();
    const editor = proseEditor('i1', '<p>x</p>');
    insertLink(editor, { item: 'i3', title: 'The Dock' });
    const dom = () => editor.view.dom.querySelector('.vlo-item-link');
    expect(dom()?.textContent).toBe('The Dock');
    setLinkItems([
      { id: 'i1', title: 'The Kettle' },
      { id: 'i3', title: 'The Old Dock' },
    ]);
    expect(dom()?.textContent).toBe('The Old Dock');
    // The link keeps the title it shows, so it still reads well once its item is gone.
    await vi.waitFor(() => {
      expect(linkNode(editor)?.attrs?.label).toBe('The Old Dock');
    });
    setLinkItems([{ id: 'i1', title: 'The Kettle' }]);
    expect(dom()?.classList.contains('vlo-item-link-broken')).toBe(true);
    expect(dom()?.textContent).toBe('The Old Dock');
    let pos = -1;
    editor.state.doc.descendants((node, at) => {
      if (node.type.name === ITEM_LINK) pos = at;
    });
    unlink(editor, pos);
    expect(linkNode(editor)).toBeUndefined();
    expect(editor.getText()).toBe('xThe Old Dock ');
  });

  test('a link opens its item, goes to a heading in an open item, and opens a closed item at the heading', async () => {
    await openProject();
    const open = vi.fn();
    const beside = vi.fn();
    setLinkOpener({ open, beside });
    const editor = proseEditor('i1', '<p>x</p>');
    insertLink(editor, { item: 'i3', title: 'The Dock' });
    // Enter on the selected link opens it.
    let pos = -1;
    editor.state.doc.descendants((node, at) => {
      if (node.type.name === ITEM_LINK) pos = at;
    });
    editor.commands.setNodeSelection(pos);
    const enter = new KeyboardEvent('keydown', { key: 'Enter' });
    expect(editor.view.someProp('handleKeyDown', (f) => f(editor.view, enter))).toBe(true);
    expect(open).toHaveBeenCalledWith('i3');
    followLink({ item: 'i3' }, true);
    expect(beside).toHaveBeenCalledWith('i3');

    const salt = proseEditor('i2', '<p>Rain.</p><h2 data-anchor="h-0000abcd">The storm</h2>');
    salt.commands.setTextSelection(1);
    followLink({ item: 'i2', heading: 'h-0000abcd' });
    expect(salt.state.selection.$head.parent.textContent).toBe('The storm');
    expect(open).toHaveBeenCalledTimes(1);

    // A closed item opens, and its editor goes to the heading once it shows.
    followLink({ item: 'i3', heading: 'h-1111abcd' });
    const dock = proseEditor('i3', '<p>Ropes.</p><h3 data-anchor="h-1111abcd">Tide</h3>');
    expect(takeLinkAnchor('i3', dock)).toBe(true);
    expect(dock.state.selection.$head.parent.textContent).toBe('Tide');
    expect(takeLinkAnchor('i3', dock)).toBe(false);
  });
});

describe('Links here', () => {
  test('the text copies keep the links, and the store lists the items that link to an item', async () => {
    await db.open();
    try {
      const { project: made } = await createProject({ title: 'Harbour', templates: ['memoir'] });
      const first = await addItem(made.id, null, 'memory', 'Morning');
      const second = await addItem(made.id, null, 'memory', 'Evening');
      const source = proseEditor(first.id, '<p>Back to </p>');
      source.commands.setTextSelection(9);
      insertLink(source, { item: second.id, title: 'Evening' });
      await writeItemText(first, docParts(source.state.doc, 'prose'), 'prose');
      expect((await db.itemTexts.get(first.id))?.links).toEqual([second.id]);
      await openLinks(made.id);
      setLinkItems([first, second]);
      expect(linksTo(second.id)).toEqual([{ id: first.id, title: 'Morning' }]);
      expect(linksTo(first.id)).toEqual([]);
      // A save without the link takes the item off the list.
      source.commands.setContent('<p>Back to the start.</p>');
      await writeItemText(first, docParts(source.state.doc, 'prose'), 'prose');
      expect(linksTo(second.id)).toEqual([]);
      expect(getLinks().index.get(first.id)).toEqual({ links: [], headings: [] });
    } finally {
      await db.delete();
    }
  });
});

describe('exports', () => {
  const linkTo = (target: string, label: string, heading?: string): JSONContent => ({
    type: ITEM_LINK,
    attrs: { item: target, label, ...(heading ? { heading } : {}) },
  });

  /** A memoir: Kettle links to Salt, to its heading, and to a deleted item. Salt has the heading. */
  function linkedDoc(scope: ExportScope = { kind: 'project' }) {
    const kettle: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ' },
            linkTo('i2', 'Old Salt'),
            { type: 'text', text: ' and ' },
            linkTo('i2', 'Old Salt › Storm', 'h-0000abcd'),
            { type: 'text', text: ' and ' },
            linkTo('gone', 'The Pier'),
          ],
        },
      ],
    };
    const salt: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Rain.' }] },
        {
          type: 'heading',
          attrs: { level: 2, anchor: 'h-0000abcd' },
          content: [{ type: 'text', text: 'The storm' }],
        },
      ],
    };
    return buildExportDoc({
      project: project('memoir'),
      items: [item('i1', 'memory', 'The Kettle'), item('i2', 'memory', 'Salt')],
      scope,
      updates: new Map([
        ['i1', updateOf(kettle, 'prose')],
        ['i2', updateOf(salt, 'prose')],
      ]),
    });
  }

  const links = (doc: ReturnType<typeof linkedDoc>) =>
    runsOf(doc.sections[0]?.blocks ?? []).filter(
      (run): run is Extract<Run, { type: 'text' }> => run.type === 'text' && run.text !== ' and ',
    );

  test('the export tree gives each link its current title and keeps the target only when the export holds it', () => {
    // The first runs are the title heading and "See ".
    const whole = links(linkedDoc()).slice(2);
    expect(whole.map((r) => [r.text, r.style.to ?? null])).toEqual([
      ['Salt', { item: 'i2' }],
      ['Salt › The storm', { item: 'i2', heading: 'h-0000abcd' }],
      ['The Pier', null],
    ]);
    const alone = links(linkedDoc({ kind: 'item', itemId: 'i1' })).slice(2);
    expect(alone.map((r) => [r.text, r.style.to ?? null])).toEqual([
      ['Salt', null],
      ['Old Salt › Storm', null],
      ['The Pier', null],
    ]);
  });

  test('Word, EPUB and PDF link to the item and to the heading', async () => {
    const doc = linkedDoc();
    const word = await JSZip.loadAsync(await toDocx(doc));
    const xml = (await word.file('word/document.xml')?.async('string')) ?? '';
    expect(xml.match(/<w:hyperlink [^>]*>/g)).toEqual([
      '<w:hyperlink w:history="1" w:anchor="vlo_i2">',
      '<w:hyperlink w:history="1" w:anchor="vlo_h0000abcd">',
    ]);
    expect(xml).toMatch(/<w:bookmarkStart w:name="vlo_h0000abcd"[^>]*\/>[\s\S]*The storm/);

    const epub = await JSZip.loadAsync(
      (
        await toEpub(doc, {
          loadFile: loadPublicFile,
          id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
          modified: new Date('2026-11-18T10:00:00Z'),
        })
      ).bytes,
    );
    const first = (await epub.file('OEBPS/text/part-1.xhtml')?.async('string')) ?? '';
    const second = (await epub.file('OEBPS/text/part-2.xhtml')?.async('string')) ?? '';
    expect(first).toContain('<a href="part-2.xhtml#s2">Salt</a>');
    expect(first).toContain('<a href="part-2.xhtml#h-0000abcd">Salt › The storm</a>');
    expect(first).not.toContain('vlo-place:');
    expect(second).toContain('<h3 id="h-0000abcd">');

    const pdf = await PDFDocument.load((await toPdf(doc, { loadFile: loadPublicFile })).bytes);
    const dests = pdf.catalog.lookup(PDFName.of('Dests'), PDFDict);
    expect(dests.has(PDFName.of('i2'))).toBe(true);
    expect(dests.has(PDFName.of('h-0000abcd'))).toBe(true);
    const goTos = pdf
      .getPages()
      .flatMap((page) => page.node.Annots()?.asArray() ?? [])
      .map((ref) => pdf.context.lookup(ref, PDFDict).get(PDFName.of('Dest'))?.toString());
    expect(goTos).toEqual(expect.arrayContaining(['/i2', '/h-0000abcd']));
  });

  test('a copy of a project from its backup moves each link to the new item ids', async () => {
    await db.open();
    try {
      const { project: made } = await createProject({ title: 'Harbour', templates: ['memoir'] });
      const first = await addItem(made.id, null, 'memory', 'Morning');
      const second = await addItem(made.id, null, 'memory', 'Evening');
      const json: JSONContent = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [linkTo(second.id, 'Evening')] }],
      };
      await writeItemUpdate(first.id, updateOf(json, 'prose'), 1);
      await db.itemTexts.put({
        itemId: first.id,
        projectId: made.id,
        text: 'Evening',
        updatedAt: 1,
        links: [second.id],
      });
      const backup = await readBackup((await backUpProject(made.id, { music: false })).bytes);
      const copyId = await importBackup(backup, 'copy');
      const copied = await db.items.where('projectId').equals(copyId).toArray();
      const morning = copied.find((i) => i.title === 'Morning');
      const evening = copied.find((i) => i.title === 'Evening');
      if (!morning || !evening) throw new Error('The copy has no items.');
      expect(JSON.stringify(updateToJson(await readItemUpdate(morning.id)))).toContain(
        `"item":"${evening.id}"`,
      );
      expect((await db.itemTexts.get(morning.id))?.links).toEqual([evening.id]);
    } finally {
      await db.delete();
    }
  });
});

import { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, test } from 'vitest';
import * as Y from 'yjs';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { poemDataFromDoc } from '@/features/editor/poemText';
import { buildExportDoc } from '@/features/export/build';
import { imageNode, item, project, updateOf } from './export-fixtures';

/*
 * Phase 16, decision G3: a poem holds an image only between two stanzas. An image never comes before the
 * first stanza or after the last one, and the lines of the poem stay as they are.
 */

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

const stanza = (...lines: string[]) => ({
  type: 'stanza',
  content: lines.map((text) => ({ type: 'poemLine', content: [{ type: 'text', text }] })),
});

function poemEditor(content: unknown[]): Editor {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({ element: host, extensions: poemExtensions(new Y.Doc(), { tabSpaces: 4 }) });
  editor.commands.setContent({ type: 'doc', content } as never);
  editors.push(editor);
  return editor;
}

/** The top-level blocks, such as ["stanza", "image", "stanza"]. */
const blocks = (editor: Editor) => {
  const out: string[] = [];
  editor.state.doc.forEach((node) => out.push(node.type.name));
  return out;
};

/** Puts the caret in the text of the `n`th top-level block. */
function caretIn(editor: Editor, n: number) {
  let pos = 0;
  for (let i = 0; i < n; i++) pos += editor.state.doc.child(i).nodeSize;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + 2)));
}

describe('Images in a poem (decision G3)', () => {
  test('an image goes after the stanza at the caret, never inside it', () => {
    const editor = poemEditor([stanza('Salt on the sill', 'and the tide out'), stanza('The gulls')]);
    caretIn(editor, 0);
    expect(editor.commands.insertImage({ id: 'g1' })).toBe(true);
    expect(blocks(editor)).toEqual(['stanza', 'image', 'stanza']);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    // Every line stays where it was.
    expect(poemDataFromDoc(editor.state.doc).map((s) => s.map((l) => l.text))).toEqual([
      ['Salt on the sill', 'and the tide out'],
      ['The gulls'],
    ]);
  });

  test('an image after the last stanza gets a new empty stanza after it', () => {
    const editor = poemEditor([stanza('Salt on the sill')]);
    caretIn(editor, 0);
    editor.commands.insertImage({ id: 'g1' });
    expect(blocks(editor)).toEqual(['stanza', 'image', 'stanza']);
    expect(editor.state.doc.lastChild?.textContent).toBe('');
  });

  test('Alt with an arrow key moves an image only to another place between two stanzas', () => {
    const editor = poemEditor([stanza('One'), imageNode({ id: 'g1' }), stanza('Two'), stanza('Three')]);
    const imageAt = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imageAt)));
    // Up would put the image before the first stanza.
    expect(editor.commands.moveImage(-1)).toBe(false);
    expect(editor.commands.moveImage(1)).toBe(true);
    expect(blocks(editor)).toEqual(['stanza', 'stanza', 'image', 'stanza']);
    // Down again would put it after the last stanza.
    expect(editor.commands.moveImage(1)).toBe(false);
    expect(blocks(editor)).toEqual(['stanza', 'stanza', 'image', 'stanza']);
  });

  test('the export reads the image between the stanzas, and the word count reads only the lines', () => {
    const json = {
      type: 'doc',
      content: [stanza('One line'), imageNode({ id: 'g1', alt: 'A gull' }), stanza('Two lines')],
    };
    const doc = buildExportDoc({
      project: project('poetry'),
      items: [item('p1', 'poem', 'Gulls')],
      scope: { kind: 'item', itemId: 'p1' },
      updates: new Map([['p1', updateOf(json, 'poem')]]),
    });
    const types = doc.sections.flatMap((s) => s.blocks.map((b) => b.type));
    expect(types.filter((t) => t !== 'heading')).toEqual(['stanza', 'image', 'stanza']);
    const editor = poemEditor(json.content);
    expect(poemDataFromDoc(editor.state.doc)).toHaveLength(2);
  });
});

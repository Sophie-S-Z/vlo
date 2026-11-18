import { Editor } from '@tiptap/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import * as Y from 'yjs';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { scriptExtensions } from '@/features/editor/extensions/script';
import { OutlineRail } from '@/features/editor/ItemOutline';
import { activeEntry, goToBlock, outlineOf } from '@/features/editor/itemOutline';
import { CommandMenu } from '@/features/project/CommandMenu';
import { db, type Project } from '@/lib/db';

/* The item outline and the "In this item" group of Mod-K (Phase 19, Task B1). */

// jsdom draws no layout, and a go-to measures the caret to scroll it into view.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  // The command menu scrolls its chosen row into view.
  Element.prototype.scrollIntoView = () => undefined;
});

const editors: Editor[] = [];
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  await db.delete();
});

function editorOn(html: string, script = false): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const ydoc = new Y.Doc();
  const editor = new Editor({ element, extensions: script ? scriptExtensions(ydoc) : proseExtensions(ydoc) });
  editor.commands.setContent(html);
  editors.push(editor);
  return editor;
}

const CHAPTER =
  '<h2>Arrival</h2><p>The boat came in late.</p>' +
  '<h3>The dock</h3><p>Rope and tar and gulls.</p>' +
  '<h4>The crate</h4><p>Nails.</p>' +
  '<h3></h3>' +
  '<div data-scene-break=""></div><p>Morning came.</p>' +
  '<h2>Departure</h2><p>She left.</p>';

test('the outline lists headings and scenes in order, and each counts its section', () => {
  const entries = outlineOf(editorOn(CHAPTER).state.doc);
  expect(entries.map((e) => [e.label, e.depth, e.words])).toEqual([
    // A Heading 2 counts the sections under it, up to the scene break at the same level.
    ['Arrival', 1, 1 + 5 + 2 + 5 + 2 + 1],
    ['The dock', 2, 2 + 5 + 2 + 1],
    ['The crate', 3, 2 + 1],
    ['Scene 2', 1, 2],
    ['Departure', 1, 1 + 2],
  ]);
});

test('a script lists its scene headings', () => {
  const editor = editorOn(
    '<p data-role="heading">INT. KITCHEN - DAY</p><p data-role="action">Steam rises.</p>' +
      '<p data-role="heading">EXT. YARD - NIGHT</p>',
    true,
  );
  expect(outlineOf(editor.state.doc).map((e) => e.label)).toEqual([
    'INT. KITCHEN - DAY',
    'EXT. YARD - NIGHT',
  ]);
});

test('a go-to puts the caret in the heading, or after the scene break, and the caret marks its entry', () => {
  const editor = editorOn(CHAPTER);
  const entries = outlineOf(editor.state.doc);
  const [, dock, , scene] = entries;
  if (!dock || !scene) throw new Error('The outline is missing an entry.');
  goToBlock(editor, dock.pos);
  expect(editor.state.selection.$head.parent.textContent).toBe('The dock');
  expect(activeEntry(entries, editor.state.selection.head)).toBe(1);
  goToBlock(editor, scene.pos);
  expect(editor.state.selection.$head.parent.textContent).toBe('Morning came.');
  expect(activeEntry(entries, editor.state.selection.head)).toBe(3);
});

test('the rail builds again after a pause in typing, and a press goes to the section', () => {
  vi.useFakeTimers();
  const editor = editorOn('<h2>One</h2><p>Text.</p>');
  render(<OutlineRail editor={editor} language={undefined} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(1);

  editor.commands.insertContentAt(editor.state.doc.content.size, '<h2>Two</h2>');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  act(() => {
    vi.advanceTimersByTime(400);
  });
  const two = screen.getByRole('button', { name: /Two/ });
  act(() => {
    two.click();
  });
  expect(editor.state.selection.$head.parent.textContent).toBe('Two');
  expect(two.getAttribute('aria-current')).toBe('location');
});

test('Mod-K shows the outline actions under "In this item"', async () => {
  const run = vi.fn();
  const done = vi.fn();
  render(
    <CommandMenu
      project={{ id: 'p' } as Project}
      items={[]}
      canOpen={() => true}
      actions={[{ id: 'outline-1', label: 'Arrival', group: 'outline', hint: '4 words', run }]}
      onOpenItem={() => undefined}
      onDone={done}
    />,
  );
  const group = await screen.findByText('In this item');
  expect(group).toBeTruthy();
  act(() => {
    screen.getByText('Arrival').click();
  });
  expect(run).toHaveBeenCalledOnce();
  expect(done).toHaveBeenCalledOnce();
});

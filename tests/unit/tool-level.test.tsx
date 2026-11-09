import { Editor } from '@tiptap/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import type { EditorForm } from '@/features/editor/commands/registry';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { Toolbar } from '@/features/editor/toolbar/Toolbar';
import {
  getWritingPrefs,
  setWritingPrefs,
  startWithSimpleTools,
  type ToolLevel,
} from '@/features/editor/writingPrefs';

/* Simple and Full tool levels (roadmap F36, plan Task G6, decision P4). */

let editor: Editor | null = null;
afterEach(() => {
  cleanup();
  editor?.destroy();
  editor = null;
  localStorage.clear();
  setWritingPrefs({ toolLevel: 'full' });
});

/** The toolbar's own controls and the items of its More menu, by name. */
async function tools(form: EditorForm, level: ToolLevel): Promise<{ bar: string[]; more: string[] }> {
  setWritingPrefs({ toolLevel: level });
  const host = document.createElement('div');
  document.body.append(host);
  const doc = new Y.Doc();
  editor = new Editor({
    element: host,
    extensions: form === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc),
  });
  const { unmount } = render(<Toolbar editor={editor} kind={form} />);
  const bar = within(screen.getByRole('toolbar', { name: 'Formatting' }))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? '');
  fireEvent.keyDown(screen.getByRole('button', { name: 'More tools' }), { key: 'Enter' });
  const menu = await screen.findByRole('menu');
  const more = Array.from(menu.querySelectorAll('[role^="menuitem"]'), (item) =>
    item.textContent.replace(/….*$|Ctrl.*$/, ''),
  );
  unmount();
  editor.destroy();
  editor = null;
  return { bar, more };
}

describe.each<EditorForm>(['prose', 'poem'])('the %s toolbar', (form) => {
  test('shows 8 controls or fewer at the Simple level', async () => {
    expect((await tools(form, 'simple')).bar.length).toBeLessThanOrEqual(8);
  });

  test('keeps every tool of the Full level in the toolbar or the More menu at the Simple level', async () => {
    const full = await tools(form, 'full');
    const simple = await tools(form, 'simple');
    const reachable = new Set([...simple.bar, ...simple.more]);
    const missing = full.bar.filter((name) => !reachable.has(name) && !/^(Text style|Alignment):/.test(name));
    expect(missing).toEqual([]);
    expect(full.more.at(-1)).toBe('Show fewer tools');
    expect(simple.more.at(-1)).toBe('Show all tools');
  });
});

describe('the first tool level', () => {
  test('a new writer starts at Simple', () => {
    localStorage.clear();
    startWithSimpleTools();
    expect(getWritingPrefs().toolLevel).toBe('simple');
  });

  test('a level that the writer chose stays', () => {
    setWritingPrefs({ toolLevel: 'full' });
    startWithSimpleTools();
    expect(getWritingPrefs().toolLevel).toBe('full');
  });
});

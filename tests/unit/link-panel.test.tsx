import { Editor } from '@tiptap/core';
import { cleanup, render, screen } from '@testing-library/react';
import * as Y from 'yjs';
import { afterEach, expect, test } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { LinkPanel } from '@/features/editor/toolbar/panels/LinkPanel';

/* The Link panel opens the link on the selection, because a press on a link in the text only edits it. */

let editor: Editor | null = null;
afterEach(() => {
  cleanup();
  editor?.destroy();
  document.body.replaceChildren();
});

function withText(html: string): Editor {
  const host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({ element: host, extensions: proseExtensions(new Y.Doc()) });
  editor.commands.setContent(html);
  editor.commands.setTextSelection(3);
  return editor;
}

test('a web link opens in a new tab from the panel', () => {
  render(
    <LinkPanel editor={withText('<p><a href="https://vlo.app/a">notes</a></p>')} onDone={() => undefined} />,
  );
  const open = screen.getByRole('link', { name: 'Open link' });
  expect(open.getAttribute('href')).toBe('https://vlo.app/a');
  expect(open.getAttribute('target')).toBe('_blank');
  expect(open.getAttribute('rel')).toBe('noreferrer');
});

test('the panel offers no Open link for a new link or a link to a place in the text', () => {
  render(<LinkPanel editor={withText('<p>plain words</p>')} onDone={() => undefined} />);
  expect(screen.queryByRole('link', { name: 'Open link' })).toBeNull();
  cleanup();
  render(<LinkPanel editor={withText('<p><a href="#notes">notes</a></p>')} onDone={() => undefined} />);
  expect(screen.queryByRole('link', { name: 'Open link' })).toBeNull();
});

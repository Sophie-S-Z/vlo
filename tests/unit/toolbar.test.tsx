import { Editor } from '@tiptap/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { poemDataToJSON, parsePoemText } from '@/features/editor/poemText';
import { Toolbar } from '@/features/editor/toolbar/Toolbar';

let editor: Editor;

beforeEach(() => {
  const host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({ element: host, extensions: poemExtensions(new Y.Doc(), { tabSpaces: 4 }) });
  editor.commands.setContent(poemDataToJSON(parsePoemText('Salt\nTide\n')));
});
afterEach(() => {
  cleanup();
  editor.destroy();
  document.body.replaceChildren();
});

test('the hanging indent is announced after a button press, and a caret move says nothing', () => {
  render(<Toolbar editor={editor} kind="poem" />);
  const status = screen.getByRole('status');
  expect(status.textContent).toBe('');
  act(() => {
    editor.commands.setTextSelection(2);
  });
  fireEvent.click(screen.getByRole('button', { name: 'More hanging indent' }));
  expect(status.textContent).toBe('Hanging indent 1 em.');
  expect(screen.getByText('Hang 1 em').getAttribute('aria-live')).toBeNull();

  // The second line has no hanging indent. Moving there changes the readout but not the announcement.
  act(() => {
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
  });
  expect(screen.getByText('Hang 0 em')).toBeTruthy();
  expect(status.textContent).toBe('Hanging indent 1 em.');
});

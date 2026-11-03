import { Editor } from '@tiptap/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { closePanel, getPanelRequest, openPanel } from '@/features/editor/commands/editorBus';
import { footnotesOf, selectedFootnote } from '@/features/editor/extensions/footnote';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { parseFill } from '@/features/editor/format/fill';
import { FootnotePanel } from '@/features/editor/toolbar/panels/FootnotePanel';
import { GradientPanel } from '@/features/editor/toolbar/panels/GradientPanel';

/* Fixes from the pull request A1 review: the note panel and other tabs, and gradient stops that pass each other. */

const editors: Editor[] = [];
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(() => {
  cleanup();
  closePanel();
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function mount(doc = new Y.Doc()) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({ element: host, extensions: proseExtensions(doc) });
  editors.push(editor);
  return editor;
}

test('the note panel stays open on its footnote when another tab edits the same paragraph', () => {
  const here = new Y.Doc();
  const there = new Y.Doc();
  there.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'here') Y.applyUpdate(here, update, 'there');
  });
  here.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'there') Y.applyUpdate(there, update, 'here');
  });
  const a = mount(here);
  const b = mount(there);
  a.commands.setContent('<p>Tide and salt.</p>');
  a.commands.setTextSelection(14);
  a.commands.insertFootnote();
  openPanel({ editor: a, panel: 'footnote', anchor: 'caret' });
  render(<FootnotePanel editor={a} />);
  expect(screen.getByRole('heading', { name: 'Footnote 1' })).toBeTruthy();

  act(() => {
    b.commands.setTextSelection(1);
    b.commands.insertContent('Low ');
  });
  expect(a.state.doc.textContent).toBe('Low Tide and salt.');
  expect(getPanelRequest()).not.toBeNull();
  expect(screen.getByRole('heading', { name: 'Footnote 1' })).toBeTruthy();
  expect(selectedFootnote(a.state)).toBe(footnotesOf(a.state)[0]?.pos);
});

test('a gradient stop moved past its neighbour keeps its color and its focus', () => {
  const e = mount();
  e.commands.setContent('<p>gold leaf</p>');
  e.commands.setTextSelection({ from: 1, to: 5 });
  render(<GradientPanel editor={e} />);
  fireEvent.click(screen.getByRole('button', { name: 'Gold leaf' }));
  const first = screen.getByRole('slider', { name: 'Color stop 1, #8a6316' });
  first.focus();
  // Gold leaf has stops at 0, 25, 50, 75 and 100. Three steps of 10 take the first one past 25.
  for (let i = 0; i < 3; i++) fireEvent.keyDown(first, { key: 'ArrowRight', shiftKey: true });
  expect(document.activeElement).toBe(first);
  expect(first.getAttribute('aria-valuenow')).toBe('30');
  expect(first.getAttribute('aria-label')).toBe('Color stop 2, #8a6316');
  const stored = parseFill(e.getAttributes('textFill').fill);
  expect(stored?.stops.slice(0, 2)).toEqual([
    { color: '#e8c35a', at: 25 },
    { color: '#8a6316', at: 30 },
  ]);
});

import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setCodexEntries, setReadingOrder } from '@/features/codex/codexStore';
import {
  CodexCompletion,
  COMPLETION_PAUSE_MS,
  completionFor,
  completionKey,
  mentionKey,
  mentionsFor,
} from '@/features/editor/extensions/codexCompletion';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { setWritingPrefs } from '@/features/editor/writingPrefs';
import type { CodexEntry } from '@/lib/db';
import { item } from './export-fixtures';

/* Phase 19, Task D4: Codex name completion and the @ list. */

const entry = (id: string, name: string, aliases: string[] = [], kind: CodexEntry['kind'] = 'character') =>
  ({ id, projectId: 'p1', kind, name, aliases, order: id }) satisfies CodexEntry;

const editors: Editor[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  setCodexEntries('p1', [
    entry('e1', 'Marigold', ['Goldie']),
    entry('e2', 'Mara Quinn'),
    entry('e3', 'Harbour', [], 'place'),
  ]);
});
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
  setWritingPrefs({ codexCompletion: true });
});

function mount(): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: [...proseExtensions(new Y.Doc()), CodexCompletion] });
  editors.push(editor);
  editor.view.dom.focus();
  return editor;
}

/** Types text, then waits for the pause. */
async function typeAndPause(editor: Editor, text: string) {
  editor.commands.insertContent(text);
  await vi.advanceTimersByTimeAsync(COMPLETION_PAUSE_MS);
}

const ghost = (editor: Editor) => editor.view.dom.querySelector('.vlo-completion')?.textContent ?? null;
const press = (editor: Editor, key: string) =>
  editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key })));

describe('completion', () => {
  test('the shortest name that starts with the word, after three letters', () => {
    const names = ['Marigold', 'Mara Quinn', 'Goldie'];
    expect(completionFor('mar', names)).toBe('Marigold');
    expect(completionFor('Mara', names)).toBe('Mara Quinn');
    expect(completionFor('Marigold', names)).toBeNull();
    expect(completionFor('Zed', names)).toBeNull();
  });

  test('the rest of the name shows after a pause, a screen reader hears it, and Tab takes it', async () => {
    const editor = mount();
    await typeAndPause(editor, 'At dawn Mari');
    expect(ghost(editor)).toBe('gold');
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      'Completion: Marigold. Press Tab to accept.',
    );
    expect(press(editor, 'Tab')).toBe(true);
    expect(editor.state.doc.textContent).toBe('At dawn Marigold');
    expect(ghost(editor)).toBeNull();
  });

  test('an alias completes, and the case of the name wins', async () => {
    const editor = mount();
    await typeAndPause(editor, 'gol');
    expect(ghost(editor)).toBe('die');
    press(editor, 'Tab');
    expect(editor.state.doc.textContent).toBe('Goldie');
  });

  test('any other key goes on, Escape hides it, and no completion splits a word', async () => {
    const editor = mount();
    await typeAndPause(editor, 'Mari');
    expect(press(editor, 'a')).toBeFalsy();
    expect(press(editor, 'Escape')).toBe(true);
    expect(ghost(editor)).toBeNull();
    editor.commands.setContent('<p>Marimba</p>');
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 5)));
    await vi.advanceTimersByTimeAsync(COMPLETION_PAUSE_MS);
    expect(ghost(editor)).toBeNull();
  });

  test('the switch in Settings turns it off', async () => {
    setWritingPrefs({ codexCompletion: false });
    const editor = mount();
    await typeAndPause(editor, 'Mari');
    expect(ghost(editor)).toBeNull();
  });
});

describe('the @ list', () => {
  test('lists the Codex entries, then the items, whose names hold the letters', () => {
    setReadingOrder([{ item: item('i1', 'scene', 'The harbour at night'), book: '' }]);
    expect(mentionsFor('har')).toEqual([
      { id: 'e3', name: 'Harbour', kind: 'Place' },
      { id: 'i1', name: 'The harbour at night', kind: 'Item', item: true },
    ]);
    expect(mentionsFor('goldie').map((m) => m.name)).toEqual(['Marigold']);
  });

  test('"@" opens the list, and Enter puts the name in the text', () => {
    const editor = mount();
    editor.commands.insertContent('Then ');
    const typed = (text: string) => {
      const { from, to } = editor.state.selection;
      const taken = editor.view.someProp('handleTextInput', (f) =>
        f(editor.view, from, to, text, () => editor.state.tr.insertText(text, from, to)),
      );
      if (!taken) editor.view.dispatch(editor.state.tr.insertText(text, from, to));
    };
    typed('@');
    typed('M');
    typed('a');
    typed('r');
    expect(mentionKey.getState(editor.state)?.matches.map((m) => m.name)).toEqual(['Marigold', 'Mara Quinn']);
    expect(press(editor, 'Enter')).toBe(true);
    expect(editor.state.doc.textContent).toBe('Then Marigold');
    expect(completionKey.getState(editor.state)).toBeNull();
  });
});

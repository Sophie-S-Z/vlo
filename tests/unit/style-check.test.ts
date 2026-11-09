import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { styleNotes, styleReason } from '@/features/analysis/style';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { canStyleCheck, StyleCheck, styleNoteAt } from '@/features/editor/extensions/styleCheck';
import { SAVE_PAUSE_MS } from '@/features/editor/saveTracker';
import { setWritingPrefs } from '@/features/editor/writingPrefs';

/* Plan Task H4 (roadmap F47): the style check. */

/** The marked words of a text, as "kind:words". */
const marked = (text: string, form: 'prose' | 'poem' = 'prose') =>
  styleNotes(text, form).map((n) => `${n.kind}:${text.slice(n.from, n.to)}`);

describe('styleNotes', () => {
  test('a word used again within 50 words is a repeat, and a stop word is not', () => {
    expect(marked('The lamp lit the lamp.')).toEqual(['repeat:lamp']);
    const far = `lamp ${Array.from({ length: 50 }, (_, i) => `w${String(i)}x`).join(' ')} lamp`;
    expect(marked(far, 'poem')).toEqual([]);
    expect(marked('She said that it was there and that it was cold.')).toEqual([]);
  });

  test('a name and a short word are not repeats', () => {
    expect(marked('Mira saw Mira go up and up.')).toEqual([]);
  });

  test('"very" is filler, and "at the end of the day" is a cliche', () => {
    expect(marked('It was very cold.')).toEqual(['filler:very']);
    expect(marked('At the end of the day, she left.')).toEqual(['cliche:At the end of the day']);
  });

  test('a 26-word sentence is long, and a poem line never is', () => {
    const long = `${Array.from({ length: 26 }, (_, i) => `w${String(i)}x`).join(' ')}.`;
    expect(marked(long)).toEqual([`long:${long}`]);
    expect(marked(long, 'poem')).toEqual([]);
    expect(marked(`${Array.from({ length: 25 }, (_, i) => `w${String(i)}x`).join(' ')}.`)).toEqual([]);
  });

  test('the reason names the words', () => {
    expect(styleReason('filler', 'very')).toBe('"very" adds little. Remove it, or use a stronger word.');
    expect(styleReason('long', 'one two three')).toContain('3 words');
  });
});

describe('the style check in the editor', () => {
  const editors: Editor[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    setWritingPrefs({ styleCheck: true });
  });
  afterEach(() => {
    for (const e of editors.splice(0)) e.destroy();
    document.body.replaceChildren();
    setWritingPrefs({ styleCheck: false });
    vi.useRealTimers();
  });

  function mount(english = true) {
    const host = document.createElement('div');
    document.body.append(host);
    const editor = new Editor({
      element: host,
      extensions: [...proseExtensions(new Y.Doc()), StyleCheck.configure({ form: 'prose', english })],
    });
    editors.push(editor);
    return editor;
  }

  const marks = (e: Editor) =>
    [...e.view.dom.querySelectorAll('.vlo-style')].map((el) => `${el.className}:${el.textContent}`);

  test('marks show after the save pause and go when the switch turns off, and the text stays', () => {
    const editor = mount();
    editor.commands.insertContent('It was very cold.');
    expect(marks(editor)).toEqual([]);
    vi.advanceTimersByTime(SAVE_PAUSE_MS);
    expect(marks(editor)).toEqual(['vlo-style vlo-style-filler:very']);
    expect(editor.getText()).toBe('It was very cold.');

    editor.commands.setTextSelection(9);
    expect(styleNoteAt(editor.state)).toEqual({ kind: 'filler', text: 'very' });

    setWritingPrefs({ styleCheck: false });
    expect(marks(editor)).toEqual([]);
    expect(styleNoteAt(editor.state)).toBeNull();
  });

  test('a project in another language gets no marks, and the switch is off for it', () => {
    const editor = mount(false);
    editor.commands.insertContent('It was very cold.');
    vi.advanceTimersByTime(SAVE_PAUSE_MS);
    expect(marks(editor)).toEqual([]);
    expect(canStyleCheck(editor.state)).toBe(false);
  });

  test('a footnote in the paragraph keeps the marks on their words', () => {
    const editor = mount();
    editor.commands.insertContent('Cold');
    editor.commands.insertFootnote();
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent(' and very cold.');
    vi.advanceTimersByTime(SAVE_PAUSE_MS);
    expect(marks(editor)).toEqual(['vlo-style vlo-style-filler:very']);
  });
});

import { Editor, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GrammarCheck, GRAMMAR_PAUSE_MS, grammarLintAt } from '@/features/editor/extensions/grammar';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { checkInWorker } from '@/features/grammar/grammarClient';
import {
  addWord,
  getGrammarPrefs,
  ignoreMark,
  removeWord,
  setGrammarOn,
  setRuleOn,
} from '@/features/grammar/grammarPrefs';
import {
  cleanFixes,
  dialectOf,
  OBJECT,
  ruleLabel,
  utf16Offsets,
  type GrammarLint,
} from '@/features/grammar/lints';

/* Phase 19, Task D1: spelling and grammar. grammar.spec.ts runs Harper itself in the browser. */

vi.mock('@/features/grammar/grammarClient', () => ({ checkInWorker: vi.fn() }));
const check = vi.mocked(checkInWorker);

/** A stand-in for Harper: a spelling mark on each "teh", and the text of each block that it read. */
const read: string[] = [];
function fakeHarper(blocks: readonly string[]): GrammarLint[][] {
  read.push(...blocks);
  return blocks.map((text) =>
    [...text.matchAll(/teh/g)].map((m) => ({
      from: m.index,
      to: m.index + 3,
      rule: 'SpellCheck',
      kind: 'Spelling',
      message: 'Did you mean to spell `teh` this way?',
      fixes: ['the'],
    })),
  );
}

const editors: Editor[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  read.length = 0;
  check.mockReset();
  check.mockImplementation((blocks) => Promise.resolve(fakeHarper(blocks)));
  setGrammarOn(true);
});
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
  setGrammarOn(false);
  for (const word of getGrammarPrefs().words) removeWord(word);
  setRuleOn('SpellCheck', true);
});

function mount(content: JSONContent[]): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [...proseExtensions(new Y.Doc()), GrammarCheck.configure({ itemId: 'a1b2', language: 'en' })],
  });
  editor.commands.setContent({ type: 'doc', content });
  editors.push(editor);
  return editor;
}

/** Runs the pause and lets the worker's answer arrive. */
async function pause(): Promise<void> {
  await vi.advanceTimersByTimeAsync(GRAMMAR_PAUSE_MS);
}

const marks = (editor: Editor) =>
  [...editor.view.dom.querySelectorAll('.vlo-spelling')].map((m) => m.textContent);

/** The words under the mark at the first "teh" after `from`. */
function markedWords(editor: Editor, from = 0): string {
  const { doc } = editor.state;
  let at = -1;
  doc.descendants((node, pos) => {
    if (at >= 0 || !node.isText || pos + (node.text?.length ?? 0) < from) return at < 0;
    const i = node.text?.indexOf('teh', Math.max(0, from - pos)) ?? -1;
    if (i >= 0) at = pos + i;
    return at < 0;
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, at + 1)));
  const found = grammarLintAt(editor.state);
  return found ? doc.textBetween(found.from, found.to) : '';
}

const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const text = (value: string, marks?: JSONContent['marks']): JSONContent =>
  marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };
const footnote: JSONContent = { type: 'footnote', attrs: { content: [text('A note.')] } };
const equation: JSONContent = { type: 'mathInline', attrs: { latex: '\\frac{a}{b}' } };
const comment = { type: 'comment', attrs: { id: 'c1', text: 'Hm.' } };

describe('the text that Harper reads', () => {
  test('Harper counts code points, and each offset becomes a UTF-16 offset', () => {
    expect(utf16Offsets('a😀b')).toEqual([0, 1, 3, 4]);
    const text = 'Mira 😀 dont';
    const offsets = utf16Offsets(text);
    // Harper gives "dont" at code points 7 to 11.
    expect(text.slice(offsets[7], offsets[11])).toBe('dont');
  });

  test('a footnote, an equation and a comment keep each mark on its words', async () => {
    const editor = mount([
      paragraph(
        text('One'),
        footnote,
        text(' teh '),
        equation,
        text(' and '),
        text('teh', [comment]),
        text(' end.'),
      ),
      paragraph(text('Two teh.')),
    ]);
    await pause();
    expect(marks(editor)).toEqual(['teh', 'teh', 'teh']);
    expect(read[0]).toBe(`One${OBJECT} teh ${OBJECT} and teh end.`);
    expect(markedWords(editor)).toBe('teh');
    expect(markedWords(editor, 10)).toBe('teh');
  });
});

describe('the marks', () => {
  test('an edit during the check never moves a mark onto other words', async () => {
    let answer: (lints: GrammarLint[][]) => void = () => undefined;
    check.mockImplementationOnce((blocks) => {
      read.push(...blocks);
      return new Promise((resolve) => {
        answer = resolve;
      });
    });
    const editor = mount([paragraph(text('Mira saw teh boat.')), paragraph(text('Then teh tide.'))]);
    await vi.advanceTimersByTimeAsync(GRAMMAR_PAUSE_MS);
    // The writer types in the first paragraph while the worker reads both.
    editor.commands.insertContentAt(1, 'At dawn ');
    answer(fakeHarper(read.splice(0)));
    await vi.advanceTimersByTimeAsync(0);
    // The second paragraph did not change, so its mark shows at once, on its own words.
    expect(marks(editor)).toEqual(['teh']);
    expect(markedWords(editor, 25)).toBe('teh');
    // The changed paragraph gets a new check at the next pause.
    await pause();
    expect(marks(editor)).toEqual(['teh', 'teh']);
    expect(markedWords(editor)).toBe('teh');
  });

  test('typing in marked words takes the mark away until the next check', async () => {
    const editor = mount([paragraph(text('Mira saw teh boat.'))]);
    await pause();
    expect(marks(editor)).toEqual(['teh']);
    editor.commands.insertContentAt(11, 'x');
    expect(marks(editor)).toEqual([]);
  });

  test('a word in the dictionary loses its mark, and the dictionary keeps it once', async () => {
    const editor = mount([paragraph(text('Mira saw teh boat.'))]);
    await pause();
    expect(marks(editor)).toEqual(['teh']);
    addWord('teh');
    expect(marks(editor)).toEqual([]);
    addWord('teh');
    expect(getGrammarPrefs().words).toEqual(['teh']);
  });

  test('a rule that is off and an ignored mark hide marks, and the switch clears them', async () => {
    const editor = mount([paragraph(text('Mira saw teh boat.'))]);
    await pause();
    setRuleOn('SpellCheck', false);
    expect(marks(editor)).toEqual([]);
    setRuleOn('SpellCheck', true);
    expect(marks(editor)).toEqual(['teh']);
    ignoreMark('a1b2', 'SpellCheck', 'teh');
    expect(marks(editor)).toEqual([]);
    ignoreMark('other', 'SpellCheck', 'boat');
    setGrammarOn(false);
    expect(editor.view.dom.querySelector('.vlo-spelling')).toBeNull();
  });

  test('with the check off, the worker never starts', async () => {
    setGrammarOn(false);
    mount([paragraph(text('Mira saw teh boat.'))]);
    await pause();
    expect(check).not.toHaveBeenCalled();
  });
});

describe('names and labels', () => {
  test('a rule name reads as words, and a fix list has no repeats', () => {
    expect(ruleLabel('SentenceCapitalization')).toBe('Sentence capitalization');
    expect(ruleLabel('SpellCheck')).toBe('Spell check');
    expect(cleanFixes('dont', ["don't", "don't", 'dont', 'dent', 'don', 'done'])).toEqual([
      "don't",
      'dent',
      'don',
    ]);
  });

  test('a project language picks the dialect', () => {
    expect([
      dialectOf('en'),
      dialectOf(undefined),
      dialectOf('en-GB'),
      dialectOf('en-au'),
      dialectOf('en-IN'),
    ]).toEqual([0, 0, 1, 2, 4]);
  });
});

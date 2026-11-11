import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { codexMatcher } from '@/features/codex/codex';
import {
  getCodex,
  resetCodex,
  setCodexEntries,
  setContinuityKept,
  setReadingOrder,
} from '@/features/codex/codexStore';
import {
  continuityNotes,
  leftBefore,
  nameWords,
  oneApart,
  sceneKey,
  type ContinuityInput,
} from '@/features/codex/continuity';
import { ContinuityCheck } from '@/features/editor/extensions/continuityCheck';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { setWritingPrefs } from '@/features/editor/writingPrefs';
import type { CodexEntry, Item } from '@/lib/db';

/* Roadmap 2 F66, plan Task N3, Review Focus 3: the continuity check. */

const mira: CodexEntry = {
  id: 'm',
  projectId: 'p',
  kind: 'character',
  name: 'Mira Hale',
  aliases: ['Thea'],
  order: 'a0',
  changes: [{ id: 'c', itemId: 's2', text: 'Drowns.', leaves: true }],
};
const places = new Map([
  ['s1', 0],
  ['s2', 1],
  ['s3', 2],
]);

function input(over: Partial<ContinuityInput> = {}): ContinuityInput {
  return {
    match: codexMatcher([mira]),
    nearNames: nameWords([mira]),
    left: new Map(),
    keptWords: new Set(),
    ...over,
  };
}
const marks = (text: string, over?: Partial<ContinuityInput>) =>
  continuityNotes(text, input(over)).map((n) => `${n.rule}:${text.slice(n.from, n.to)}`);

describe('rule 1: a name one letter away from a Codex name', () => {
  test('one letter changed, added, taken out or two letters swapped', () => {
    expect(oneApart('mria', 'mira')).toBe(true);
    expect(oneApart('mirra', 'mira')).toBe(true);
    expect(oneApart('mra', 'mira')).toBe(true);
    expect(oneApart('mora', 'mira')).toBe(true);
    expect(oneApart('mrai', 'mira')).toBe(false);
    expect(oneApart('mira', 'mira')).toBe(false);
  });

  test('a capital word in the middle of a sentence marks, with the name it is near', () => {
    expect(marks('The boat took Mria home, and Hael too.')).toEqual(['near-name:Mria', 'near-name:Hael']);
    expect(continuityNotes('She saw Mria.', input())[0]).toMatchObject({ name: 'Mira', entryId: 'm' });
    expect(marks("We met Mria's sister.")).toEqual(['near-name:Mria']);
  });

  test('the first word of a sentence, a Codex name or its plural, a short word and a kept word never mark', () => {
    expect(marks('Then she left. “Then go,” he said. Mira Hale and Thea wait.')).toEqual([]);
    expect(marks('Ask Mra and Ted.')).toEqual([]);
    expect(marks('We met the Hales.')).toEqual([]);
    expect(marks('She saw Mria.', { keptWords: new Set(['Mria']) })).toEqual([]);
    // An English project only: other languages give no near-name list.
    expect(marks('She saw Mria.', { nearNames: null })).toEqual([]);
  });
});

describe('rule 2: a mention after "Leaves the story"', () => {
  test('an entry left in an earlier scene, and not in this one or a kept one', () => {
    expect(leftBefore([mira], places, 's3', new Set())).toEqual(new Map([['m', 's2']]));
    expect(leftBefore([mira], places, 's2', new Set())).toEqual(new Map());
    expect(leftBefore([mira], places, 's1', new Set())).toEqual(new Map());
    expect(leftBefore([mira], places, 's3', new Set([sceneKey('m', 's3')]))).toEqual(new Map());
  });

  test('each mention of the entry marks, by any of its names', () => {
    const left = new Map([['m', 's2']]);
    expect(marks('Thea waved. Mira Hale did not.', { left })).toEqual(['left:Thea', 'left:Mira Hale']);
    expect(continuityNotes('Thea waved.', input({ left }))[0]?.leftIn).toBe('s2');
  });
});

describe('the marks in the editor', () => {
  const editors: Editor[] = [];
  beforeEach(() => {
    localStorage.clear();
    setCodexEntries('p', [mira]);
    const item = (id: string, title: string): Item => ({ id, projectId: 'p', title }) as unknown as Item;
    setReadingOrder([
      { item: item('s1', 'Scene 1'), book: 'Tides' },
      { item: item('s2', 'Scene 2'), book: 'Tides' },
      { item: item('s3', 'Scene 3'), book: 'Tides' },
    ]);
  });
  afterEach(() => {
    for (const e of editors.splice(0)) e.destroy();
    setWritingPrefs({ continuityCheck: false });
    resetCodex();
  });
  function mount(itemId: string) {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [...proseExtensions(new Y.Doc()), ContinuityCheck.configure({ itemId, english: true })],
    });
    editors.push(editor);
    editor.commands.setContent('<p>The boat took Mria home. Thea waved.</p>');
    return editor;
  }
  const shown = (e: Editor) =>
    [...e.view.dom.querySelectorAll('.vlo-continuity')].map((el) => el.textContent);

  test('off by default; on, it marks with no change to the text, and a kept mark goes at once', () => {
    const editor = mount('s3');
    const before = editor.getJSON();
    expect(shown(editor)).toEqual([]);
    setWritingPrefs({ continuityCheck: true });
    expect(shown(editor)).toEqual(['Mria', 'Thea']);
    expect(editor.getJSON()).toEqual(before);
    setContinuityKept({ words: ['Mria'], scenes: [sceneKey('m', 's3')] });
    expect(shown(editor)).toEqual([]);
  });

  test('kept marks that each save reads again as a new object leave the Codex state as it is', () => {
    setContinuityKept({ words: ['Mria'], scenes: [] });
    const before = getCodex();
    setContinuityKept({ words: ['Mria'], scenes: [] });
    expect(getCodex()).toBe(before);
    setContinuityKept(undefined);
    expect(getCodex()).not.toBe(before);
  });
});

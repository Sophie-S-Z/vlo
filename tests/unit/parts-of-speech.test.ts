import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import posTagger from 'wink-pos-tagger';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PartsOfSpeech, POS_PAUSE_MS } from '@/features/editor/extensions/partsOfSpeech';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { tagInWorker } from '@/features/pos/posClient';
import { reloadPosPrefs, setPosKindOn, setPosOn } from '@/features/pos/posPrefs';
import { kindOf, marksOf, plainQuotes } from '@/features/pos/posTags';

/* Phase 19, Task D5: parts-of-speech colors, with the real tagger in place of the worker. */

const tagger = posTagger();
const tag = (text: string) => marksOf(text, tagger.tagSentence(plainQuotes(text)));

vi.mock('@/features/pos/posClient', () => ({ tagInWorker: vi.fn() }));
const worker = vi.mocked(tagInWorker);

const editors: Editor[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  reloadPosPrefs();
  worker.mockImplementation((blocks) => Promise.resolve(blocks.map(tag)));
});
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
  worker.mockReset();
});

/** Each colored word of the text, with its kind. */
const colored = (editor: Editor) =>
  [...editor.view.dom.querySelectorAll('[class^="vlo-pos-"]')].map((el) => [
    el.textContent,
    el.className.replace('vlo-pos-', ''),
  ]);

describe('the tagger', () => {
  test('a known sentence gets the right kinds', () => {
    const text = 'The old sailor quickly mended his nets, but the storm came.';
    const words = tag(text).map((m) => [text.slice(m.from, m.to), m.kind]);
    expect(words).toEqual([
      ['old', 'adjective'],
      ['sailor', 'noun'],
      ['quickly', 'adverb'],
      ['mended', 'verb'],
      ['nets', 'noun'],
      ['but', 'conjunction'],
      ['storm', 'noun'],
      ['came', 'verb'],
    ]);
  });

  test('curly quotes keep each word in place, and "n’t" gets no color of its own', () => {
    const text = 'She doesn’t know Mara’s boat.';
    const words = tag(text).map((m) => text.slice(m.from, m.to));
    expect(words).toEqual(['does', 'know', 'Mara', 'boat']);
    expect(kindOf('MD')).toBe('verb');
    expect(kindOf('DT')).toBeNull();
  });

  test('a mix of curly and straight quotes keeps every word in place', () => {
    const text = "She said ‘run home’ and the dog's owner laughed.";
    const words = tag(text).map((m) => text.slice(m.from, m.to));
    expect(words).toEqual(['said', 'run', 'and', 'dog', 'owner', 'laughed']);
  });
});

describe('the colors in the text', () => {
  function mount(): Editor {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({ element, extensions: [...proseExtensions(new Y.Doc()), PartsOfSpeech] });
    editors.push(editor);
    return editor;
  }

  test('the colors show after a pause, only while the switch is on, and each kind has its own switch', async () => {
    const editor = mount();
    editor.commands.setContent('<p>Boats drift slowly.</p>');
    await vi.advanceTimersByTimeAsync(POS_PAUSE_MS);
    expect(colored(editor)).toEqual([]);
    setPosOn(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(colored(editor)).toEqual([
      ['Boats', 'noun'],
      ['drift', 'verb'],
      ['slowly', 'adverb'],
    ]);
    setPosKindOn('verb', false);
    expect(colored(editor)).toEqual([
      ['Boats', 'noun'],
      ['slowly', 'adverb'],
    ]);
    setPosOn(false);
    expect(colored(editor)).toEqual([]);
  });

  test('an edited word loses its color until the next pause', async () => {
    setPosOn(true);
    const editor = mount();
    editor.commands.setContent('<p>Boats drift.</p>');
    await vi.advanceTimersByTimeAsync(POS_PAUSE_MS);
    expect(colored(editor)).toHaveLength(2);
    editor.commands.setTextSelection(12);
    editor.commands.insertContent('ed');
    expect(colored(editor)).toEqual([['Boats', 'noun']]);
    await vi.advanceTimersByTimeAsync(POS_PAUSE_MS);
    expect(colored(editor)).toEqual([
      ['Boats', 'noun'],
      ['drifted', 'verb'],
    ]);
  });
});

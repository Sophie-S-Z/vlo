import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { dictionary } from 'cmu-pronouncing-dictionary';
import * as Y from 'yjs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';
import data from '@/features/thesaurus/thesaurus.json';
import {
  baseForms,
  inCaseOf,
  lookUp,
  rhymeIndex,
  rhymesFor,
  type ThesaurusData,
} from '@/features/thesaurus/thesaurus';
import { ThesaurusPanel } from '@/features/thesaurus/ThesaurusPanel';

/* Phase 19, Task D2: the thesaurus and the rhymes, from the real WordNet and CMU files. */

const thesaurus = data as unknown as ThesaurusData;
const rhymes = rhymeIndex(dictionary, thesaurus);

// The worker cannot run in jsdom, so the card reads the same files here.
vi.mock('@/features/thesaurus/thesaurusClient', () => ({
  wordsFor: (word: string) => Promise.resolve(lookUp(thesaurus, word)),
  rhymesOf: (word: string) => Promise.resolve(rhymesFor(rhymes, word)),
}));

const editors: Editor[] = [];
afterEach(() => {
  cleanup();
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

describe('the thesaurus', () => {
  test('"bright" lists "brilliant" under its light sense, with "dull" as the opposite', () => {
    const entry = lookUp(thesaurus, 'bright');
    const light = entry?.senses.find((s) => s.definition.includes('light'));
    expect(light?.pos).toBe('adjective');
    expect(light?.words).toContain('brilliant');
    expect(light?.words).not.toContain('bright');
    expect(light?.antonyms).toEqual(['dull']);
  });

  test('a word finds the form it comes from, and an object key is no word', () => {
    expect(baseForms('Brightest')).toContain('bright');
    expect(baseForms('running')).toContain('run');
    expect(lookUp(thesaurus, 'Brightest')?.word).toBe('bright');
    expect(lookUp(thesaurus, 'cities')?.word).toBe('city');
    expect(lookUp(thesaurus, 'hasOwnProperty')).toBeNull();
    expect(lookUp(thesaurus, 'zxqv')).toBeNull();
  });

  test('a replacement takes the case of the word', () => {
    expect(inCaseOf('Bright', 'brilliant')).toBe('Brilliant');
    expect(inCaseOf('BRIGHT', 'brilliant')).toBe('BRILLIANT');
    expect(inCaseOf('bright', 'brilliant')).toBe('brilliant');
    expect(inCaseOf('I', 'me')).toBe('Me');
  });

  test('a click in the card replaces the word at the caret and keeps its bold and its capital', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({ element, extensions: proseExtensions(new Y.Doc()) });
    editors.push(editor);
    editor.commands.setContent('<p>A <strong>Bright</strong> morning.</p>');
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 5)));
    const onDone = vi.fn();
    render(<ThesaurusPanel editor={editor} form="prose" onDone={onDone} />);
    expect(screen.getByRole<HTMLInputElement>('searchbox', { name: 'Word' }).value).toBe('Bright');
    const list = await screen.findByRole('list', {
      name: 'Words that mean: emitting or reflecting light readily or in large amounts',
    });
    fireEvent.click(within(list).getByRole('button', { name: 'brilliant' }));
    expect(editor.getHTML()).toBe('<p>A <strong>Brilliant</strong> morning.</p>');
    expect(onDone).toHaveBeenCalled();
  });

  test('a poem gets a Rhymes tab', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({ element, extensions: proseExtensions(new Y.Doc()) });
    editors.push(editor);
    editor.commands.setContent('<p>the light</p>');
    render(<ThesaurusPanel editor={editor} form="poem" onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rhymes' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Rhymes' }).nextElementSibling?.textContent).toContain(
        'night',
      );
    });
  });
});

describe('the rhymes', () => {
  test('"light" rhymes with "night", and "life" is a near rhyme', () => {
    const found = rhymesFor(rhymes, 'light');
    expect(found?.syllables).toBe(1);
    expect(found?.perfect.map((r) => r.word)).toContain('night');
    expect(found?.perfect.map((r) => r.word)).not.toContain('light');
    expect(found?.near.map((r) => r.word)).toContain('life');
  });

  test('the fewest syllables come first, and obscene words stay out', () => {
    const moon = rhymesFor(rhymes, 'moon');
    const counts = moon?.perfect.map((r) => r.syllables) ?? [];
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(moon?.perfect.map((r) => r.word)).toContain('tune');
    expect(moon?.perfect.map((r) => r.word)).not.toContain('coon');
    expect(rhymesFor(rhymes, 'zxqv')).toBeNull();
  });
});

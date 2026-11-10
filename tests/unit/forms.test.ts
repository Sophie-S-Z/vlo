import { readFileSync } from 'node:fs';
import { dictionary } from 'cmu-pronouncing-dictionary';
import { syllable } from 'syllable';
import { describe, expect, test } from 'vitest';
import { checkForm, type PoemForm } from '@/features/craft/forms';
import { lexiconOf, scanLines, type LineScan } from '@/features/craft/scan';

/* The poetry form check (roadmap F56, plan Task K1, Review Focus 4). */

const lexicon = lexiconOf(dictionary, syllable);

function stanzasOf(text: string): string[][] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((s) => s.split('\n').map((l) => l.trim()));
}

const fixture = (name: string) => stanzasOf(readFileSync(`tests/fixtures/forms/${name}.txt`, 'utf8'));

function check(form: PoemForm, stanzas: string[][], english = true) {
  const scans = english ? scanLines(stanzas.flat(), lexicon) : null;
  return checkForm(form, stanzas, scans);
}

/** A copy of the poem with one line changed. `index` counts over the whole poem. */
function withLine(stanzas: string[][], index: number, text: string): string[][] {
  let n = 0;
  return stanzas.map((s) => s.map((line) => (n++ === index ? text : line)));
}

describe('public-domain and Vlo fixtures give no notes', () => {
  test.each([
    ['sonnet', 'sonnet-130'],
    ['villanelle', 'house-on-the-hill'],
    ['pantoum', 'in-town'],
    ['sestina', 'tramp-royal'],
    ['ghazal', 'ghazal'],
    ['haiku', 'haiku'],
  ] as const)('%s: %s', (form, name) => {
    expect(check(form, fixture(name))).toEqual([]);
  });

  test('a sonnet in one stanza or in four stanzas checks the same', () => {
    const lines = fixture('sonnet-130').flat();
    const split = [lines.slice(0, 4), lines.slice(4, 8), lines.slice(8, 12), lines.slice(12)];
    expect(check('sonnet', split)).toEqual([]);
  });
});

describe('each form names what is wrong', () => {
  test('a sonnet of 13 lines gets one count note', () => {
    const poem = [fixture('sonnet-130').flat().slice(0, 13)];
    expect(check('sonnet', poem)).toEqual([
      { line: null, kind: 'count', message: 'A sonnet has 14 lines. This poem has 13.' },
    ]);
  });

  test('a sonnet line that breaks the rhyme is named', () => {
    const poem = withLine(fixture('sonnet-130'), 2, 'If snow be white, why then her breasts are grey;');
    const notes = check('sonnet', poem).filter((n) => n.kind === 'rhyme');
    expect(notes).toEqual([{ line: 2, kind: 'rhyme', message: 'Line 3 does not rhyme with line 1.' }]);
  });

  test('a Petrarchan rhyme scheme passes', () => {
    // Hand-made scans: only the rhyme letters matter here.
    const letters = 'ABBAABBACDECDE'.split('');
    const scans: LineScan[] = letters.map((rhyme) => ({ syllables: 10, words: [], meter: 'iambic', rhyme }));
    const lines = [letters.map((_, i) => `line ${String(i)}`)];
    expect(checkForm('sonnet', lines, scans)).toEqual([]);
  });

  test('a sonnet line far from 10 syllables is meter drift', () => {
    const short = withLine(fixture('sonnet-130'), 9, 'A sound');
    expect(check('sonnet', short).filter((n) => n.kind === 'meter')).toEqual([
      { line: 9, kind: 'meter', message: 'Line 10 has 2 syllables. The measure is 10.' },
    ]);
  });

  test('in a form with no fixed measure, most lines set it', () => {
    const poem = withLine(
      fixture('house-on-the-hill'),
      7,
      'To speak them good or ill, or anything at all that comes to mind:',
    );
    expect(check('villanelle', poem).filter((n) => n.kind === 'meter')).toHaveLength(1);
  });

  test('a villanelle with a changed refrain names the line', () => {
    const poem = withLine(fixture('house-on-the-hill'), 11, 'They are all gone today,');
    expect(check('villanelle', poem)).toContainEqual({
      line: 11,
      kind: 'refrain',
      message: 'Line 12 should repeat line 1.',
    });
  });

  test('a sestina with a wrong end word names the line and stanza', () => {
    const poem = withLine(fixture('tramp-royal'), 8, 'The different ways that different things are made,');
    expect(check('sestina', poem)).toEqual([
      { line: 8, kind: 'endword', message: 'Line 9 should end with “done” (stanza 2).' },
    ]);
  });

  test('a pantoum with a broken repeat names the line', () => {
    const poem = withLine(fixture('in-town'), 4, 'Here is that lady again:');
    expect(check('pantoum', poem)).toEqual([
      { line: 4, kind: 'refrain', message: 'Line 5 should repeat line 2.' },
    ]);
  });

  test('a haiku of 5-8-5 names line 2', () => {
    const poem = withLine(fixture('haiku'), 1, 'opens wide on a field of frost.');
    expect(check('haiku', poem)).toEqual([
      { line: 1, kind: 'syllables', message: 'Line 2 has 8 syllables. A haiku line 2 has 7.' },
    ]);
  });

  test('a ghazal line with no refrain names the couplet', () => {
    const poem = withLine(fixture('ghazal'), 5, 'It says them slowly to the stones at night.');
    expect(check('ghazal', poem)).toEqual([
      { line: 5, kind: 'refrain', message: 'Line 6 should end with the refrain “rain comes down tonight”.' },
    ]);
  });

  test('a poem in another language gets structure notes and no rhyme notes', () => {
    const lines = fixture('house-on-the-hill');
    const notes = check('villanelle', withLine(lines, 5, 'שורה אחרת'), false);
    expect(notes).toEqual([{ line: 5, kind: 'refrain', message: 'Line 6 should repeat line 1.' }]);
    expect(check('haiku', [['א', 'ב', 'ג']], false)).toEqual([]);
  });
});

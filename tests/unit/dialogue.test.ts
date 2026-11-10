import { describe, expect, test } from 'vitest';
import { codexMatcher } from '@/features/codex/codex';
import { voiceFor } from '@/features/editor/readAloud/cast';
import { quotesIn, speakersOf } from '@/features/editor/readAloud/dialogue';
import type { CodexEntry } from '@/lib/db';

/* Plan Task K3 (roadmap F58): the speaker of each quote, and the voice of each speaker. */

const character = (id: string, name: string, aliases: string[] = []): CodexEntry => ({
  id,
  projectId: 'p',
  kind: 'character',
  name,
  aliases,
  order: 'a0',
});

const match = codexMatcher([character('mara', 'Mara', ['Captain Vos']), character('tom', 'Tomas')]);

/** Each paragraph as its parts, with the speaker of each part: "who: words". */
const read = (...paragraphs: string[]) =>
  speakersOf(paragraphs, match).map((segments, i) =>
    segments.map((s) => `${s.speaker ?? 'narrator'}: ${(paragraphs[i] ?? '').slice(s.from, s.to).trim()}`),
  );

describe('quotesIn', () => {
  test('finds straight, curly, French and German quotes', () => {
    const text = (t: string) => quotesIn(t).map((q) => t.slice(q.from, q.to));
    expect(text('She said "Go." Then “Stay.”')).toEqual(['"Go."', '“Stay.”']);
    expect(text('« Viens », dit-il. »Komm«, sagte er. „Geh“, rief sie.')).toEqual([
      '« Viens »',
      '»Komm«',
      '„Geh“',
    ]);
  });

  test('a single quote inside a double quote is part of it, and an apostrophe opens no quote', () => {
    const t = '“She told me ‘never’ twice,” said Tom. Don’t go. It’s late.';
    expect(quotesIn(t).map((q) => t.slice(q.from, q.to))).toEqual(['“She told me ‘never’ twice,”']);
    expect(quotesIn("Don't feed the dogs' dinner to the cat.")).toEqual([]);
    expect(quotesIn("He said 'run' and ran.").map((q) => q.from)).toEqual([8]);
  });

  test('a quote that the paragraph does not close is open', () => {
    expect(quotesIn('“The sea took them all.')).toEqual([{ from: 0, to: 23, open: true }]);
  });
});

describe('speakersOf', () => {
  test('a name next to a speech verb wins, before or after the name', () => {
    expect(read('Tomas looked up. “Run,” said Mara.')).toEqual([
      ['narrator: Tomas looked up.', 'mara: “Run,”', 'narrator: said Mara.'],
    ]);
    expect(read('“Run,” Mara whispered, and Tomas ran.')[0]?.[0]).toBe('mara: “Run,”');
  });

  test('else the first name outside the quotes, by its other name too', () => {
    expect(read('Captain Vos turned. “Tomas is late.”')).toEqual([
      ['narrator: Captain Vos turned.', 'mara: “Tomas is late.”'],
    ]);
  });

  test('a quote that goes on into the next paragraph keeps its speaker', () => {
    expect(read('“The sea took them all,” said Tomas. “Every boat.', '“And every net.”')).toEqual([
      ['tom: “The sea took them all,”', 'narrator: said Tomas.', 'tom: “Every boat.'],
      ['tom: “And every net.”'],
    ]);
  });

  test('a two-person exchange with no names goes back and forth', () => {
    expect(
      read('“Where?” asked Mara.', '“The harbour,” said Tomas.', '“When?”', '“At dawn.”').map((p) => p[0]),
    ).toEqual(['mara: “Where?”', 'tom: “The harbour,”', 'mara: “When?”', 'tom: “At dawn.”']);
  });

  test('a quote with no clear speaker gets the narrator, and narration stays one part', () => {
    expect(read('“Who goes there?”', 'The wind rose.', '')).toEqual([
      ['narrator: “Who goes there?”'],
      ['narrator: The wind rose.'],
      [],
    ]);
  });
});

describe('voiceFor', () => {
  const voices = ['a', 'b', 'c'];

  test('the narrator has the main voice, and each character another voice in turn', () => {
    const voiceOf = voiceFor(['mara', 'tom', 'sol'], voices, {}, 'b');
    expect([null, 'mara', 'tom', 'sol'].map(voiceOf)).toEqual(['b', 'a', 'c', 'a']);
  });

  test('the writer’s choice wins while the device has that voice', () => {
    const voiceOf = voiceFor(['mara', 'tom'], voices, { mara: 'b', tom: 'gone' }, 'a');
    expect([voiceOf('mara'), voiceOf('tom')]).toEqual(['b', 'c']);
  });

  test('with one voice, or for a speaker it does not know, every part has the narrator', () => {
    expect(voiceFor(['mara'], ['a'], {}, 'a')('mara')).toBe('a');
    expect(voiceFor(['mara'], voices, {}, 'a')('stranger')).toBe('a');
    expect(voiceFor(['mara'], [], {}, null)(null)).toBeNull();
  });
});

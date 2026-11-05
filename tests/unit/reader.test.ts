import { describe, expect, it } from 'vitest';
import { COWRITER_SYSTEM, READER_SYSTEM } from '@/features/ai/prompts';
import { fitText, privateRequest, readerRequest, restoreNames, type ItemContext } from '@/features/ai/reader';
import { findPassages, passagesOf, PASSAGE_BUDGET } from '@/features/ai/retrieve';
import { estimateTokens } from '@/features/ai/engine/types';

/* Plan Task D5 (F23, US10, Gate 4): Reader requests, Ask the manuscript and aliases in a memoir. */

const scene: ItemContext = {
  id: 's1',
  title: 'The harbour',
  kind: 'scene',
  text: 'Mira found the wet ledger under the stairs.\n\nShe counted the boats in 1987, and Tomas lied.',
};

const passages = passagesOf([
  { itemId: 's1', title: 'The harbour', text: scene.text },
  {
    itemId: 's2',
    title: 'The market',
    text: 'Tomas sold fish at the market in 1986.\n\nThe gulls were loud.',
  },
  { itemId: 's3', title: 'Winter', text: 'Snow covered the quay. Nobody went out.' },
]);

describe('the spec prompts', () => {
  it('keeps the Reader and Co-writer system prompts word for word', () => {
    expect(READER_SYSTEM).toContain('Give observations and questions, never replacement text.');
    expect(READER_SYSTEM).toContain('Quote at most 12 words from the text');
    expect(COWRITER_SYSTEM).toContain('Write only what the writer asked for, with no preamble and no notes.');
  });
});

describe('readerRequest', () => {
  it('sends the item text with the Reader prompt for feedback', () => {
    const request = readerRequest('feedback', { item: scene, passages, budget: 2000 });
    expect(request.system).toBe(READER_SYSTEM);
    expect(request.result).toBe('notes');
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]?.content).toContain('feedback on this scene, "The harbour"');
    expect(request.messages[0]?.content).toContain('Mira found the wet ledger');
  });

  it('marks the synopsis as metadata, not manuscript text', () => {
    const request = readerRequest('synopsis', { item: scene, passages, budget: 2000 });
    expect(request.result).toBe('synopsis');
    expect(request.messages[0]?.content).toContain('This summary is not for the manuscript.');
  });

  it('asks the manuscript with only the passages that match', () => {
    const request = readerRequest('ask', { question: 'Who sold fish?', passages, budget: 2000 });
    const body = request.messages[0]?.content ?? '';
    expect(body).toContain('Question: Who sold fish?');
    expect(body).toContain('Tomas sold fish at the market');
    expect(body).not.toContain('Snow covered the quay');
    expect(() => readerRequest('ask', { question: '  ', passages, budget: 2000 })).toThrow(
      'Type a question first.',
    );
  });

  it('checks continuity against other passages that share a name or a year', () => {
    const body =
      readerRequest('continuity', { item: scene, passages, budget: 2000 }).messages[0]?.content ?? '';
    expect(body).toContain('Tomas sold fish at the market in 1986');
    expect(body).not.toContain('Snow covered the quay');
  });

  it('refuses an empty item, and cuts a long one to whole words within the budget', () => {
    expect(() => readerRequest('feedback', { item: { ...scene, text: ' ' }, passages, budget: 10 })).toThrow(
      'This scene has no words yet.',
    );
    const long = 'word '.repeat(5000);
    const fitted = fitText(long, 100);
    expect(fitted.cut).toBe(true);
    expect(estimateTokens(fitted.text)).toBeLessThanOrEqual(100);
    expect(fitted.text.endsWith('word')).toBe(true);
    const body = readerRequest('feedback', { item: { ...scene, text: long }, passages, budget: 100 })
      .messages[0]?.content;
    expect(body).toContain('(The scene continues. This is its first part.)');
  });
});

describe('Ask the manuscript passages', () => {
  it('keeps at most 8 passages within 3,000 tokens', () => {
    const many = passagesOf(
      Array.from({ length: 30 }, (_, i) => ({
        itemId: `i${String(i)}`,
        title: `Item ${String(i)}`,
        text: `The lighthouse keeper ${'watched the sea '.repeat(60)}`,
      })),
    );
    const found = findPassages(many, 'lighthouse keeper');
    expect(found.length).toBeLessThanOrEqual(8);
    expect(found.reduce((sum, p) => sum + estimateTokens(p.text), 0)).toBeLessThanOrEqual(PASSAGE_BUDGET);
  });
});

describe('a memoir request (Gate 4)', () => {
  const people = [
    {
      id: 'p1',
      variants: [
        { real: 'Rosa', alias: 'Maria' },
        { real: 'Aunt Rosa', alias: 'Aunt Maria' },
        { real: 'Rosie', alias: 'Mia' },
      ],
    },
    { id: 'p2', variants: [{ real: "O'Brien", alias: 'Byrne' }] },
  ];
  const memory: ItemContext = {
    id: 'm1',
    title: 'Aunt Rosa’s kitchen',
    kind: 'memory',
    text: 'Aunt Rosa baked on Sundays. We called her Rosie. Mr O’Brien came by with eggs.',
  };
  const memoirPassages = passagesOf([
    { itemId: 'm1', title: memory.title, text: memory.text },
    { itemId: 'm2', title: 'The bakery', text: 'Rosa sold the bakery to O’Brien in 1979.' },
  ]);

  it('holds no real name, nickname or curly-quote variant in any part of the body', () => {
    for (const action of ['feedback', 'synopsis', 'tags', 'continuity'] as const) {
      const safe = privateRequest(
        readerRequest(action, { item: memory, passages: memoirPassages, budget: 2000 }),
        people,
        true,
      );
      const body = JSON.stringify(safe);
      for (const real of ['Rosa', 'Rosie', "O'Brien", 'O’Brien']) expect(body).not.toContain(real);
      expect(body).toContain('Aunt Maria');
      expect(body).toContain('Mia');
      expect(body).toContain('Byrne');
    }
    const ask = privateRequest(
      readerRequest('ask', {
        question: 'What did Rosa sell to O’Brien?',
        passages: memoirPassages,
        budget: 2000,
      }),
      people,
      true,
    );
    const body = JSON.stringify(ask);
    expect(body).toContain('Maria sold the bakery to Byrne');
    for (const real of ['Rosa', 'Rosie', "O'Brien", 'O’Brien']) expect(body).not.toContain(real);
  });

  it('sends real names when the switch is off, and shows real names in the answer', () => {
    const plain = privateRequest(
      readerRequest('feedback', { item: memory, passages: memoirPassages, budget: 2000 }),
      people,
      false,
    );
    expect(JSON.stringify(plain)).toContain('Aunt Rosa');
    expect(restoreNames('Aunt Maria and Byrne talk. Mia laughs.', people, true)).toBe(
      "Aunt Rosa and O'Brien talk. Rosie laughs.",
    );
    expect(restoreNames('Aunt Maria', people, false)).toBe('Aunt Maria');
  });
});

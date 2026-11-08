import { describe, expect, test } from 'vitest';
import { cowriterRequest, splitAlternatives, type CowriterContext } from '@/features/ai/cowriter';
import { estimateTokens } from '@/features/ai/engine/types';
import { ALTERNATIVE_BREAK, COWRITER_SYSTEM } from '@/features/ai/prompts';

/* Co-writer requests (spec F23, plan Task D6): what each action sends, and the checks before it sends. */

function context(change: Partial<CowriterContext> = {}): CowriterContext {
  return {
    item: { id: 's1', title: 'The harbour', kind: 'scene', text: 'Mira found the ledger.' },
    before: 'Mira found the ledger under the stairs.',
    selection: '',
    words: 100,
    budget: 4000,
    ...change,
  };
}

const sent = (request: { messages: { content: string }[] }) => request.messages[0]?.content ?? '';

describe('Continue', () => {
  test('sends the text before the caret and asks for the number of words', () => {
    const request = cowriterRequest('continue', context());
    expect(request.system).toBe(COWRITER_SYSTEM);
    expect(request.itemId).toBe('s1');
    expect(request.result).toBe('draft');
    expect(sent(request)).toContain('Mira found the ledger under the stairs.');
    expect(sent(request)).toContain('in about 100 words');
    expect(request.maxTokens).toBe(260);
  });

  test.each([
    [10, 50],
    [900, 300],
    [149.6, 150],
  ])('keeps %s words between 50 and 300, as %s', (words, kept) => {
    expect(cowriterRequest('continue', context({ words })).label).toContain(`about ${String(kept)} words`);
  });

  test('sends only the end of a long text, cut at a word, within the budget', () => {
    const before = Array.from({ length: 400 }, (_, i) => `word${String(i)}`).join(' ');
    const text = /<text>\n([\s\S]*)\n<\/text>/.exec(
      sent(cowriterRequest('continue', context({ before, budget: 50 }))),
    )?.[1];
    expect(text).toBeDefined();
    expect(before.endsWith(text ?? '')).toBe(true);
    expect(text).toMatch(/^word\d+ /);
    expect(estimateTokens(text ?? '')).toBeLessThanOrEqual(50);
  });

  test('refuses an empty text', () => {
    expect(() => cowriterRequest('continue', context({ before: '  \n' }))).toThrow(
      new RangeError('Write the start of the scene first.'),
    );
  });
});

describe('Rewrite and Three alternatives', () => {
  test('a rewrite sends the selection, the text before it and the note', () => {
    const request = cowriterRequest(
      'rewrite',
      context({ selection: ' She counted the boats. ', instruction: 'in past tense' }),
    );
    expect(request.result).toBe('draft');
    expect(sent(request)).toContain('<passage>\nShe counted the boats.\n</passage>');
    expect(sent(request)).toContain('<context>\nMira found the ledger under the stairs.\n</context>');
    expect(sent(request)).toContain(' in past tense.');
  });

  test('Three alternatives asks for the break line between the versions', () => {
    const request = cowriterRequest(
      'alternatives',
      context({ selection: 'She counted the boats.', before: '' }),
    );
    expect(request.result).toBe('alternatives');
    expect(sent(request)).toContain(`a line that holds only ${ALTERNATIVE_BREAK}`);
    expect(sent(request)).not.toContain('<context>');
  });

  test.each(['rewrite', 'alternatives'] as const)('%s refuses an empty or too long selection', (action) => {
    expect(() => cowriterRequest(action, context({ selection: ' ' }))).toThrow(
      'Select the words to rewrite first.',
    );
    expect(() => cowriterRequest(action, context({ selection: 'x '.repeat(500), budget: 100 }))).toThrow(
      'The selection is too long for this engine.',
    );
  });
});

describe('Brainstorm', () => {
  test('sends the topic and the item text, and asks for one idea a line', () => {
    const request = cowriterRequest('brainstorm', context({ topic: 'what the ledger hides' }));
    expect(request.result).toBe('ideas');
    expect(sent(request)).toContain('short ideas for: what the ledger hides.');
    expect(sent(request)).toContain('<text>\nMira found the ledger.\n</text>');
  });

  test('refuses an empty topic', () => {
    expect(() => cowriterRequest('brainstorm', context({ topic: ' ' }))).toThrow(
      'Say what to brainstorm about first.',
    );
  });
});

describe('splitAlternatives', () => {
  test('splits at each line of dashes and drops empty parts', () => {
    expect(splitAlternatives('One.\n---\nTwo — with a dash.\n  -----  \nThree.\n---\n')).toEqual([
      'One.',
      'Two — with a dash.',
      'Three.',
    ]);
  });

  test('keeps dashes inside a line', () => {
    expect(splitAlternatives('A --- B')).toEqual(['A --- B']);
  });
});

import { describe, expect, test } from 'vitest';
import { premise, punchWords } from '@/features/workshop/comedy';
import { workshopTools } from '@/features/workshop/tools';
import { commandsFor } from '@/features/editor/commands/registry';

/* The Comedy mode: its Workshop tools and its rimshot. */

describe('punch words', () => {
  test('take the last word of the last sentence of each joke, where a blank line ends a joke', () => {
    const text = 'I bought a dog. He files my taxes.\n\nMy cat is a spy!\n\n';
    expect(punchWords([{ id: 'a', title: 'Bit 1', text }], 'en')).toEqual([
      {
        id: 'a',
        title: 'Bit 1',
        punches: [
          { lead: 'He files my', word: 'taxes.' },
          { lead: 'My cat is a', word: 'spy!' },
        ],
      },
    ]);
  });

  test('a one-word joke and an empty bit', () => {
    expect(punchWords([{ id: 'a', title: 'A', text: 'Pineapple.' }])[0]?.punches).toEqual([
      { lead: '', word: 'Pineapple.' },
    ]);
    expect(punchWords([{ id: 'b', title: 'B', text: '  \n\n ' }])[0]?.punches).toEqual([]);
  });
});

describe('the premise machine', () => {
  test('makes a question from the two lists, and keeps a name capitalized', () => {
    expect(premise(() => 0)).toBe('What if a pirate became a life coach?');
    expect(premise(() => 13 / 16)).toMatch(/^What if Shakespeare /);
    expect(premise(() => 0.9999)).toMatch(/^What if an alien tourist .+\?$/);
  });
});

test('a comedy project gets its Workshop tools and the rimshot, and a novel gets neither', () => {
  expect(workshopTools(['comedy']).map((t) => t.id)).toEqual(['punchlines', 'premises']);
  expect(workshopTools(['novel'])).toEqual([]);
  for (const form of ['prose', 'poem', 'script'] as const) {
    expect(commandsFor(form, ['comedy']).map((c) => c.id)).toContain('rimshot');
    expect(commandsFor(form, ['novel']).map((c) => c.id)).not.toContain('rimshot');
  }
});

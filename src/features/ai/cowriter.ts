import { estimateTokens } from './engine/types';
import { ALTERNATIVE_BREAK, COWRITER_SYSTEM } from './prompts';
import { fitText, type AiRequest, type ItemContext } from './reader';

/*
 * Co-writer actions (spec section 10, F23, plan Task D6). The AI drafts only when the writer asks. Each
 * draft shows in the Assistant panel first, and only Insert puts it in the text, with the aiOrigin mark.
 * Brainstorm stays in the panel.
 */

export type CowriterAction = 'continue' | 'rewrite' | 'alternatives' | 'brainstorm';

export const COWRITER_ACTIONS: readonly { id: CowriterAction; label: string }[] = [
  { id: 'continue', label: 'Continue' },
  { id: 'rewrite', label: 'Rewrite selection' },
  { id: 'alternatives', label: 'Three alternatives' },
  { id: 'brainstorm', label: 'Brainstorm' },
];

export const CONTINUE_WORDS = [50, 100, 200, 300] as const;

export interface CowriterContext {
  item: ItemContext;
  /** The text before the caret or the selection. */
  before: string;
  /** The selected text, if any. */
  selection: string;
  /** Words for Continue, from 50 to 300. */
  words: number;
  /** The writer's note for a rewrite, such as "shorter" or "in past tense". */
  instruction?: string;
  /** What to brainstorm about. */
  topic?: string;
  /** The most tokens of context to send. */
  budget: number;
}

/** The end of the text, cut to whole words within `budget` tokens. */
export function fitTail(text: string, budget: number): string {
  if (estimateTokens(text) <= budget) return text;
  const slice = text.slice(text.length - budget * 4);
  const start = slice.search(/\s/);
  return (start >= 0 ? slice.slice(start) : slice).trimStart();
}

export function cowriterRequest(action: CowriterAction, context: CowriterContext): AiRequest {
  const { item } = context;
  const base = { action, system: COWRITER_SYSTEM, itemId: item.id };
  const selection = context.selection.trim();
  const note = context.instruction?.trim() ?? '';
  switch (action) {
    case 'continue': {
      const words = Math.min(300, Math.max(50, Math.round(context.words)));
      const before = fitTail(context.before.trimEnd(), context.budget);
      if (before === '') throw new RangeError(`Write the start of the ${item.kind} first.`);
      return {
        ...base,
        label: `Continue ${item.title}, about ${String(words)} words`,
        messages: [
          {
            role: 'user',
            content: `Here is my ${item.kind}, "${item.title}", up to where I stopped:\n<text>\n${before}\n</text>\n\nContinue it from where it stops, in about ${String(words)} words.`,
          },
        ],
        maxTokens: Math.ceil(words * 2) + 60,
        result: 'draft',
      };
    }
    case 'rewrite':
    case 'alternatives': {
      if (selection === '') throw new RangeError('Select the words to rewrite first.');
      const fitted = fitText(selection, context.budget);
      if (fitted.cut)
        throw new RangeError('The selection is too long for this engine. Select a shorter passage.');
      const before = fitTail(context.before.trimEnd(), Math.min(1000, context.budget));
      const lead = before === '' ? '' : `The text before it:\n<context>\n${before}\n</context>\n\n`;
      const size = estimateTokens(selection);
      if (action === 'rewrite')
        return {
          ...base,
          label: `Rewrite in ${item.title}`,
          messages: [
            {
              role: 'user',
              content: `Rewrite this passage from my ${item.kind}.${note ? ` ${note}.` : ''} Keep it close to its length.\n\n${lead}The passage:\n<passage>\n${selection}\n</passage>\n\nGive only the new passage.`,
            },
          ],
          maxTokens: size * 2 + 100,
          result: 'draft',
        };
      return {
        ...base,
        label: `Three alternatives in ${item.title}`,
        messages: [
          {
            role: 'user',
            content: `Write three different versions of this passage from my ${item.kind}.${note ? ` ${note}.` : ''} Separate the versions with a line that holds only ${ALTERNATIVE_BREAK}. Give only the three versions.\n\n${lead}The passage:\n<passage>\n${selection}\n</passage>`,
          },
        ],
        maxTokens: size * 6 + 150,
        result: 'alternatives',
      };
    }
    case 'brainstorm': {
      const topic = context.topic?.trim() ?? '';
      if (topic === '') throw new RangeError('Say what to brainstorm about first.');
      const text = fitText(item.text.trim(), context.budget).text;
      return {
        ...base,
        label: `Brainstorm: ${topic}`,
        messages: [
          {
            role: 'user',
            content: `Give me 5 to 10 short ideas for: ${topic}. Base them on my ${item.kind} "${item.title}" below. One idea a line.\n\n<text>\n${text}\n</text>`,
          },
        ],
        maxTokens: 500,
        result: 'ideas',
      };
    }
  }
}

/** The versions of a "Three alternatives" answer. */
export function splitAlternatives(text: string): string[] {
  return text
    .split(/^\s*-{3,}\s*$/m)
    .map((part) => part.trim())
    .filter(Boolean);
}

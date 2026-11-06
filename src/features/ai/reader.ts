import { aliasesOf, aliasText, type PrivatePerson } from '@/lib/privacy';
import type { ChatMessage } from './engine/types';
import { estimateTokens } from './engine/types';
import { READER_SYSTEM } from './prompts';
import { findPassages, namesIn, passagesText, type Passage } from './retrieve';

/*
 * Reader actions (spec section 10, F23, plan Task D5). Each one builds a request from the writer's text.
 * Every answer stays in the Assistant panel. Only "Use as synopsis" writes anything, and it writes the
 * synopsis field, which is metadata and not manuscript text.
 */

export type ReaderAction = 'feedback' | 'ask' | 'synopsis' | 'tags' | 'continuity';

/** What the panel does with an answer. */
export type ResultKind = 'notes' | 'synopsis' | 'draft' | 'alternatives' | 'ideas';

export interface AiRequest {
  action: string;
  /** The action as the panel names it, such as "Feedback on Scene 1". */
  label: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  result: ResultKind;
  /** The item the request is about, if any. */
  itemId?: string;
}

export interface ItemContext {
  id: string;
  title: string;
  /** The kind in lower case, such as "scene" or "poem". */
  kind: string;
  /** The item's plain text. */
  text: string;
}

export interface ReaderContext {
  item?: ItemContext;
  question?: string;
  /** Every passage of the manuscript, for Ask the manuscript and the continuity check. */
  passages: readonly Passage[];
  /** The most tokens of the item's own text to send. */
  budget: number;
  /** The most tokens of other passages, for Ask the manuscript and the continuity check. */
  passageBudget?: number;
}

export const READER_ACTIONS: readonly { id: ReaderAction; label: string; needsItem: boolean }[] = [
  { id: 'feedback', label: 'Feedback', needsItem: true },
  { id: 'ask', label: 'Ask the manuscript', needsItem: false },
  { id: 'synopsis', label: 'Summarize for synopsis', needsItem: true },
  { id: 'tags', label: 'Suggest tags or themes', needsItem: true },
  { id: 'continuity', label: 'Continuity check', needsItem: true },
];

/** The text cut to whole words within `budget` tokens. */
export function fitText(text: string, budget: number): { text: string; cut: boolean } {
  if (estimateTokens(text) <= budget) return { text, cut: false };
  const limit = budget * 4;
  const slice = text.slice(0, limit);
  const end = slice.search(/\s\S*$/);
  return { text: (end > 0 ? slice.slice(0, end) : slice).trimEnd(), cut: true };
}

const passageOptions = (context: ReaderContext) =>
  context.passageBudget === undefined ? {} : { budget: context.passageBudget };

/** The tokens of a request with its answer, by the rough count of `estimateTokens`. */
export function requestTokens(request: AiRequest): number {
  const sent = request.system + request.messages.map((m) => m.content).join('\n');
  return estimateTokens(sent) + request.maxTokens;
}

/**
 * Refuses a request that does not fit in `limit` tokens with its answer. The in-browser models read 4,096
 * tokens at most, and the rough count can be low, so the panel gives them a smaller limit.
 */
export function checkFits(request: AiRequest, limit: number): void {
  if (requestTokens(request) > limit)
    throw new RangeError(
      'This request is too long for the model in this browser. Select a shorter passage, or pick another engine.',
    );
}

function itemBlock(item: ItemContext, budget: number): string {
  const fitted = fitText(item.text.trim(), budget);
  const note = fitted.cut ? `\n(The ${item.kind} continues. This is its first part.)` : '';
  return `<text>\n${fitted.text}\n</text>${note}`;
}

/** The request for a Reader action. */
export function readerRequest(action: ReaderAction, context: ReaderContext): AiRequest {
  const item = context.item;
  if (action === 'ask') {
    const question = context.question?.trim() ?? '';
    if (question === '') throw new RangeError('Type a question first.');
    const found = findPassages(context.passages, question, passageOptions(context));
    const body =
      found.length === 0
        ? 'No passage of the manuscript matches the question.'
        : `<passages>\n${passagesText(found)}\n</passages>`;
    return {
      action,
      label: `Ask: ${question}`,
      system: READER_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Answer my question about my manuscript from these passages only. Name the passage number for each point. If the passages do not answer it, say so.\n\nQuestion: ${question}\n\n${body}`,
        },
      ],
      maxTokens: 700,
      result: 'notes',
    };
  }
  if (!item) throw new RangeError('Open an item first.');
  if (item.text.trim() === '') throw new RangeError(`This ${item.kind} has no words yet.`);
  const text = itemBlock(item, context.budget);
  const base = { action, system: READER_SYSTEM, itemId: item.id };
  switch (action) {
    case 'feedback':
      return {
        ...base,
        label: `Feedback on ${item.title}`,
        messages: [
          { role: 'user', content: `Give me feedback on this ${item.kind}, "${item.title}".\n\n${text}` },
        ],
        maxTokens: 700,
        result: 'notes',
      };
    case 'synopsis':
      return {
        ...base,
        label: `Synopsis of ${item.title}`,
        messages: [
          {
            role: 'user',
            content: `Summarize this ${item.kind}, "${item.title}", in at most 60 words, in the present tense, for the synopsis field of my binder. This summary is not for the manuscript. Give only the summary.\n\n${text}`,
          },
        ],
        maxTokens: 200,
        result: 'synopsis',
      };
    case 'tags':
      return {
        ...base,
        label: `Tags for ${item.title}`,
        messages: [
          {
            role: 'user',
            content: `Suggest 3 to 7 tags or themes for this ${item.kind}, "${item.title}". Give one a line, each with a short reason.\n\n${text}`,
          },
        ],
        maxTokens: 400,
        result: 'notes',
      };
    case 'continuity': {
      const query = namesIn(item.text).join(' ');
      const others =
        query === ''
          ? []
          : findPassages(context.passages, query, {
              ...passageOptions(context),
              skipItem: item.id,
              exact: true,
            });
      const rest =
        others.length === 0
          ? 'No other passage shares a name, a place or a year with it.'
          : `Other passages:\n<passages>\n${passagesText(others)}\n</passages>`;
      return {
        ...base,
        label: `Continuity of ${item.title}`,
        messages: [
          {
            role: 'user',
            content: `Check this ${item.kind}, "${item.title}", for continuity with the other passages: names, dates, ages, places and other facts. List each mismatch with a short quote from each side. If you find none, say so.\n\n${text}\n\n${rest}`,
          },
        ],
        maxTokens: 700,
        result: 'notes',
      };
    }
  }
}

/**
 * The request with every private name replaced by its alias, when the memoir's switch is on (spec 8.2 and
 * section 10). The writer's question, the item and each passage go through the same match as share-safe
 * export, so a curly apostrophe or a nickname variant is caught too.
 */
export function privateRequest(request: AiRequest, people: readonly PrivatePerson[], on: boolean): AiRequest {
  const aliases = aliasesOf(people);
  if (!on || aliases.length === 0) return request;
  return {
    ...request,
    label: aliasText(request.label, aliases),
    system: aliasText(request.system, aliases),
    messages: request.messages.map((m) => ({ ...m, content: aliasText(m.content, aliases) })),
  };
}

/** An answer with each alias back as the real name, for the writer's own screen. */
export function restoreNames(text: string, people: readonly PrivatePerson[], on: boolean): string {
  if (!on) return text;
  const back = aliasesOf(people).map((a) => ({ name: a.alias, alias: a.name }));
  // Each alias maps back to the first real name that uses it.
  const seen = new Set<string>();
  return aliasText(
    text,
    back.filter((a) => {
      if (seen.has(a.name)) return false;
      seen.add(a.name);
      return true;
    }),
  );
}

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { CodexMatch } from '@/features/codex/codex';
import type { CodexEntry } from '@/lib/db';
import { blockText } from '../textMap';
import { splitSentences, spokenText, type Sentence } from './sentences';

/*
 * The table read (roadmap F58, plan Task K3). Vlo finds each quote in a paragraph and the character who
 * says it, so read aloud can give each character a voice. The rules, in order:
 * 1. A Codex character named next to a speech verb ("said Mara", "Mara asked") in the paragraph.
 * 2. The first Codex character named in the paragraph outside its quotes.
 * 3. A quote that goes on from an open quote of the paragraph before keeps its speaker.
 * 4. In a two-person exchange with no names, the speaker before the last one.
 * 5. Else the narrator.
 * A script (F63) needs no guess: each character line names the speaker of the lines under it.
 */

/** A part of a paragraph, by offset. `speaker` is a Codex entry id, or null for the narrator. */
export interface Segment {
  from: number;
  to: number;
  speaker: string | null;
}

/** Each opening quote mark and the marks that close it. */
const CLOSERS: Readonly<Record<string, string>> = {
  '“': '”',
  '"': '"',
  '«': '»',
  '»': '«',
  '„': '“”',
  '‹': '›',
  '‘': '’',
  "'": "'",
};
const SINGLE = new Set(['‘', "'"]);
const LETTER = /[\p{L}\p{N}]/u;
const SPEECH =
  /^(?:said|says|say|asked|asks|ask|replied|replies|answered|answers|whispered|whispers|shouted|shouts|called|calls|cried|cries|told|tells|added|adds|muttered|mutters|yelled|yells|sighed|sighs)$/i;

/** True when a single quote at `i` opens a quote and is not an apostrophe, as in "don't" or "dogs'". */
function opensSingle(text: string, i: number): boolean {
  const before = text[i - 1];
  const after = text[i + 1];
  return (before === undefined || !LETTER.test(before)) && after !== undefined && after !== ' ';
}

function closesSingle(text: string, i: number): boolean {
  const after = text[i + 1];
  return after === undefined || !LETTER.test(after);
}

interface Quote {
  from: number;
  to: number;
  /** True when the paragraph ends before the quote closes, so the next paragraph goes on with it. */
  open: boolean;
}

/** The quotes of a paragraph, with their marks. A single quote inside a double quote is part of it. */
export function quotesIn(text: string): Quote[] {
  const quotes: Quote[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    const closers = CLOSERS[ch];
    if (closers === undefined || (SINGLE.has(ch) && !opensSingle(text, i))) {
      i += 1;
      continue;
    }
    let end = i + 1;
    while (end < text.length) {
      const c = text.charAt(end);
      if (closers.includes(c) && (!SINGLE.has(ch) || closesSingle(text, end))) break;
      end += 1;
    }
    const open = end >= text.length;
    quotes.push({ from: i, to: open ? text.length : end + 1, open });
    i = open ? text.length : end + 1;
  }
  return quotes;
}

/** The words just before and after a name, to find a speech verb next to it. */
function nearSpeech(text: string, from: number, to: number): boolean {
  const before = text.slice(Math.max(0, from - 24), from).match(/[\p{L}]+/gu) ?? [];
  const after = text.slice(to, to + 24).match(/[\p{L}]+/gu) ?? [];
  return [...before.slice(-2), ...after.slice(0, 2)].some((w) => SPEECH.test(w));
}

/** The speaker of the paragraph's quotes, by rules 1 and 2. */
function namedSpeaker(text: string, quotes: readonly Quote[], match: (text: string) => CodexMatch[]) {
  const outside = match(text).filter((m) => !quotes.some((q) => m.from >= q.from && m.to <= q.to));
  return (outside.find((m) => nearSpeech(text, m.from, m.to)) ?? outside[0])?.entryId ?? null;
}

/**
 * The parts of each paragraph: narration and quotes in order, each with its speaker. `match` finds the
 * names of the Codex characters.
 */
export function speakersOf(
  paragraphs: readonly string[],
  match: (text: string) => CodexMatch[],
): Segment[][] {
  // The speakers of the last two paragraphs with quotes, newest last.
  let last: (string | null)[] = [];
  let carried: string | null = null;
  return paragraphs.map((text) => {
    const quotes = quotesIn(text);
    if (quotes.length === 0) {
      carried = null;
      return text.trim() === '' ? [] : [{ from: 0, to: text.length, speaker: null }];
    }
    let speaker = namedSpeaker(text, quotes, match);
    if (speaker === null && carried !== null && quotes[0]?.from === text.length - text.trimStart().length)
      speaker = carried;
    if (speaker === null) {
      const [a, b] = last;
      if (a !== undefined && b !== undefined && a !== null && b !== null && a !== b) speaker = a;
    }
    last = [...last, speaker].slice(-2);
    carried = quotes.at(-1)?.open ? speaker : null;
    const out: Segment[] = [];
    let at = 0;
    for (const q of quotes) {
      if (text.slice(at, q.from).trim() !== '') out.push({ from: at, to: q.from, speaker: null });
      out.push({ from: q.from, to: q.to, speaker });
      at = q.to;
    }
    if (text.slice(at).trim() !== '') out.push({ from: at, to: text.length, speaker: null });
    return out;
  });
}

/** The Codex character of a script's character line, such as "ALICE (V.O.)". Case does not count. */
export function cueSpeaker(cue: string, characters: readonly CodexEntry[]): string | null {
  const name = cue
    .replace(/\([^)]*\)|\^/g, '')
    .trim()
    .toUpperCase();
  return (
    characters.find((c) => [c.name, ...c.aliases].some((n) => n.trim().toUpperCase() === name))?.id ?? null
  );
}

/** The speakers of a script's lines. The character line itself is a cue, so no one reads it. */
function scriptSpeakers(
  lines: readonly { text: string; role: unknown }[],
  cue: (text: string) => string | null,
): Segment[][] {
  let speaker: string | null = null;
  return lines.map(({ text, role }) => {
    if (role === 'character') {
      speaker = cue(text);
      return [];
    }
    const speech = role === 'dialogue' || role === 'lyric';
    if (!speech && role !== 'parenthetical') speaker = null;
    return text.trim() === '' ? [] : [{ from: 0, to: text.length, speaker: speech ? speaker : null }];
  });
}

/**
 * The sentences of the document for a table read, each with the voice of its speaker. A quote and the
 * narration around it are separate sentences, so each gets its own voice.
 */
export function castSentences(
  doc: ProseMirrorNode,
  match: (text: string) => CodexMatch[],
  voiceOf: (speaker: string | null) => string | null,
  cue: (text: string) => string | null = () => null,
): Sentence[] {
  const blocks: { text: string; role: unknown; at: (index: number) => number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    blocks.push({ ...blockText(node, pos), role: node.attrs.role });
    return false;
  });
  const segments = blocks.some((b) => b.role !== undefined)
    ? scriptSpeakers(blocks, cue)
    : speakersOf(
        blocks.map((b) => b.text),
        match,
      );
  const out: Sentence[] = [];
  blocks.forEach(({ text, at }, index) => {
    for (const segment of segments[index] ?? []) {
      const part = text.slice(segment.from, segment.to);
      for (const piece of splitSentences(part)) {
        const lead = piece.text.length - piece.text.trimStart().length;
        const body = piece.text.trim();
        if (body === '') continue;
        const start = segment.from + piece.index + lead;
        const from = at(start);
        const to = at(start + body.length - 1) + 1;
        const spoken = spokenText(doc, from, to);
        if (/[\p{L}\p{N}]/u.test(spoken))
          out.push({ from, to, text: spoken, voice: voiceOf(segment.speaker) });
      }
    }
  });
  return out;
}

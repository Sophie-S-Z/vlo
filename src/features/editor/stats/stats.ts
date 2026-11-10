import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { countLines, countWords } from '@/lib/wordcount';
import { docBody } from '../itemText';
import { cleanDayStart, dayStartKey, type DayStart } from './dayStart';
import type { EditorForm } from '@/features/library/templates';

export { cleanDayStart, dayStartKey };

/*
 * Writing stats (plan E4): words, characters, reading time and words written today, for the details
 * panel. The counts cover the writing without its notes, as the word count above the text does.
 */

/** Silent reading speed for prose, in words a minute. */
export const READING_WPM = 238;
/** Speaking speed for a reading out loud, in words a minute. */
export const SPEAKING_WPM = 150;

export interface TextStats {
  words: number;
  /** Characters with spaces, counted as a reader sees them (grapheme clusters). */
  characters: number;
  /** Characters without spaces. */
  charactersNoSpaces: number;
  /** Paragraphs for prose, lines for poems. */
  blocks: number;
  sentences: number;
  /** Minutes to read silently, rounded up, 0 for no words. */
  readingMinutes: number;
  /** Minutes to read out loud, rounded up, 0 for no words. */
  speakingMinutes: number;
}

let graphemes: Intl.Segmenter | null = null;
let sentenceSplitter: Intl.Segmenter | null = null;

function countGraphemes(text: string): number {
  graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let count = 0;
  for (const part of graphemes.segment(text)) if (part.segment !== '\n') count += 1;
  return count;
}

function countSentences(text: string): number {
  sentenceSplitter ??= new Intl.Segmenter(undefined, { granularity: 'sentence' });
  let count = 0;
  for (const block of text.split(/\n+/)) {
    for (const part of sentenceSplitter.segment(block)) if (/[\p{L}\p{N}]/u.test(part.segment)) count += 1;
  }
  return count;
}

/** The stats of a plain text. Blocks are separated by line breaks. */
export function textStats(text: string, kind: EditorForm, language?: string): TextStats {
  const words = countWords(text, language);
  const blocks =
    kind === 'poem' ? countLines(text) : text.split(/\n{2,}/).filter((b) => b.trim() !== '').length;
  return {
    words,
    characters: countGraphemes(text),
    charactersNoSpaces: countGraphemes(text.replace(/\s+/g, '')),
    blocks,
    sentences: countSentences(text),
    readingMinutes: words === 0 ? 0 : Math.ceil(words / READING_WPM),
    speakingMinutes: words === 0 ? 0 : Math.ceil(words / SPEAKING_WPM),
  };
}

export function docStats(doc: ProseMirrorNode, kind: EditorForm, language?: string): TextStats {
  return textStats(docBody(doc, kind), kind, language);
}

/** Words in a range of the document, for the selection. */
export function rangeWords(doc: ProseMirrorNode, from: number, to: number, language?: string): number {
  return countWords(doc.textBetween(from, to, '\n\n', ' '), language);
}

/** "about 3 min", or "under 1 min" for a short text. */
export function minutesLabel(minutes: number): string {
  if (minutes <= 1) return 'under 1 min';
  if (minutes < 60) return `about ${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `about ${String(hours)} h` : `about ${String(hours)} h ${String(rest)} min`;
}

/* Words written today: the project total now, less the total at the first look today. */

export function localDay(time = clock.now()): string {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Words added today, net of words removed, never below 0. With no record for today, the record starts
 * now at `total`.
 */
export async function wordsToday(projectId: string, total: number): Promise<number> {
  const key = dayStartKey(projectId);
  const today = localDay();
  const record = cleanDayStart((await db.appMeta.get(key))?.value);
  if (record?.day === today) return Math.max(0, total - record.start);
  await db.appMeta.put({ key, value: { day: today, start: total } satisfies DayStart });
  return 0;
}

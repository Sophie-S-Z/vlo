import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { dayKey } from '@/features/progress/streaks';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { countGraphemes, countLines, countWords, READING_WPM, SPEAKING_WPM } from '@/lib/wordcount';
import { docBody } from '../itemText';
import { cleanDayStart, dayStartKey, type DayStart } from './dayStart';
import type { EditorForm } from '@/features/library/templates';

/*
 * Writing stats (plan E4): words, characters, reading time and words written today, for the details
 * panel. The counts cover the writing without its notes, as the word count above the text does.
 */

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

let sentenceSplitter: Intl.Segmenter | null = null;

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

/* Words written today: the project total now, less the total at the first look today. */

export function localDay(time = clock.now()): string {
  return dayKey(time);
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

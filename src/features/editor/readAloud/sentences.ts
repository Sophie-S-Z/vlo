import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { blockText, NODE_MARK } from '../textMap';

/*
 * The sentences that read aloud speaks (plan E2), each with its place in the document, so the sentence
 * that is spoken can be marked. A sentence never runs across two paragraphs or two poem lines.
 */

export interface Sentence {
  from: number;
  to: number;
  text: string;
}

let segmenter: Intl.Segmenter | null = null;

/** Splits text into sentences, with their start index. */
export function splitSentences(text: string): { index: number; text: string }[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'sentence' });
  const parts: { index: number; text: string }[] = [];
  for (const part of segmenter.segment(text)) parts.push({ index: part.index, text: part.segment });
  return parts;
}

/**
 * The sentences between `from` and `to`. A sentence that the range cuts starts or ends at the range, so
 * "read the selection" reads only the selected words.
 */
export function sentencesIn(doc: ProseMirrorNode, from = 0, to = doc.content.size): Sentence[] {
  const sentences: Sentence[] = [];
  doc.nodesBetween(from, to, (block, pos) => {
    if (!block.isTextblock) return true;
    const { text, at } = blockText(block, pos);
    for (const part of splitSentences(text)) {
      // Leading and trailing spaces are not part of what is marked.
      const lead = part.text.length - part.text.trimStart().length;
      const body = part.text.trim();
      if (body === '') continue;
      let start = at(part.index + lead);
      let end = at(part.index + lead + body.length - 1) + 1;
      if (end <= from || start >= to) continue;
      start = Math.max(start, from);
      end = Math.min(end, to);
      const spoken = doc
        .textBetween(start, end, ' ', ' ')
        .replaceAll(NODE_MARK, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // A sentence of only an equation or a note marker has nothing to say.
      if (/[\p{L}\p{N}]/u.test(spoken)) sentences.push({ from: start, to: end, text: spoken });
    }
    return false;
  });
  return sentences;
}

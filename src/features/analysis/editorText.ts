import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { AI_ORIGIN } from '@/features/editor/format/aiOrigin';
import { blockText, type BlockText } from '@/features/editor/textMap';
import { countWords } from '@/lib/wordcount';

/*
 * The text that the analysis tools read, with a map back to the document, so a report can select the
 * words that it names. Paragraphs are apart by a blank line, and the lines of a stanza by a line break.
 * Footnotes and equations are not part of it, as the word count leaves out notes.
 */

export interface MappedText {
  text: string;
  /** The document position of the character at `index`. */
  at: (index: number) => number;
}

export function mappedText(doc: ProseMirrorNode): MappedText {
  let text = '';
  const blocks: { start: number; block: BlockText }[] = [];
  let lastParent: ProseMirrorNode | null = null;
  doc.descendants((node, pos, parent) => {
    if (!node.isTextblock) return true;
    const block = blockText(node, pos);
    if (text !== '') text += node.type.name === 'poemLine' && parent === lastParent ? '\n' : '\n\n';
    lastParent = parent;
    blocks.push({ start: text.length, block });
    text += block.text;
    return false;
  });
  const at = (index: number): number => {
    let low = 0;
    let high = blocks.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((blocks[mid]?.start ?? 0) <= index) low = mid;
      else high = mid - 1;
    }
    const entry = blocks[low];
    if (!entry) return 1;
    const offset = Math.max(0, Math.min(entry.block.text.length, index - entry.start));
    return entry.block.at(offset);
  };
  return { text, at };
}

/** Words that carry the aiOrigin mark: text that Vlo's co-writer wrote and the writer inserted. */
export function aiOriginWords(doc: ProseMirrorNode): { ai: number; total: number } {
  let ai = 0;
  let total = 0;
  doc.descendants((node) => {
    if (!node.isText) return true;
    const words = countWords(node.text ?? '');
    total += words;
    if (node.marks.some((mark) => mark.type.name === AI_ORIGIN)) ai += words;
    return false;
  });
  return { ai, total };
}

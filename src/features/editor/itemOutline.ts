import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Selection } from '@tiptap/pm/state';
import { countWords } from '@/lib/wordcount';
import { acceptedDoc } from './format/suggestion';
import { scrollToCaret } from './lastPlace';
import { leafText } from './leafText';
import { SCRIPT_LINE } from './scriptRoles';

/*
 * The outline of the open item (Phase 19, Task B1): its headings, its scene breaks and, in a script, its
 * scene headings. Each entry counts the words of its section, up to the next entry at the same or a
 * higher level, so a Heading 2 counts the Heading 3 sections under it.
 */

export interface OutlineEntry {
  label: string;
  /** 1 is the top level. Heading 2, a scene break and a script scene heading are at 1. */
  depth: number;
  /** The position of the block in the document. */
  pos: number;
  words: number;
}

/** A go-to puts the section start at 20 percent of the visible height. */
const GO_TO_RATIO = 0.2;

/** The depth of a top-level block in the outline, or 0 when the block is no entry. */
function depthOf(node: ProseMirrorNode): number {
  switch (node.type.name) {
    case 'heading':
      return Math.max(1, Number(node.attrs.level) - 1);
    case 'sceneBreak':
      return 1;
    case SCRIPT_LINE:
      return node.attrs.role === 'heading' ? 1 : 0;
    default:
      return 0;
  }
}

/** The entries of the document, in document order. `language` sets the count unit. */
export function outlineOf(doc: ProseMirrorNode, language?: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  // The entries whose sections hold the block. Each of them counts its words.
  const open: OutlineEntry[] = [];
  let scenes = 1;
  doc.forEach((node, pos) => {
    const depth = depthOf(node);
    if (node.type.name === 'sceneBreak') scenes += 1;
    const label = node.type.name === 'sceneBreak' ? `Scene ${String(scenes)}` : node.textContent.trim();
    // An empty heading is no entry yet, as in Google Docs.
    if (depth > 0 && label !== '') {
      while (open.length > 0 && (open.at(-1)?.depth ?? 0) >= depth) open.pop();
      const entry = { label, depth, pos, words: 0 };
      entries.push(entry);
      open.push(entry);
    }
    if (open.length === 0) return;
    const block = acceptedDoc(node);
    const words = countWords(block.textBetween(0, block.content.size, '\n\n', leafText), language);
    for (const entry of open) entry.words += words;
  });
  return entries;
}

/** The entry that holds the position: the last entry at or before it, or -1. */
export function activeEntry(entries: readonly OutlineEntry[], pos: number): number {
  return entries.findLastIndex((entry) => entry.pos <= pos);
}

/** Puts the caret at the start of the section and scrolls it near the top of the window. */
export function goToEntry(editor: Editor, entry: OutlineEntry): void {
  if (editor.isDestroyed) return;
  const { doc, tr } = editor.state;
  const pos = Math.min(entry.pos, doc.content.size);
  const node = doc.nodeAt(pos);
  // The caret goes into a heading, and after a scene break, which holds no text.
  const at = node && !node.isAtom ? pos + 1 : pos + (node?.nodeSize ?? 0);
  editor.view.dispatch(tr.setSelection(Selection.near(doc.resolve(Math.min(at, doc.content.size)))));
  editor.view.focus();
  scrollToCaret(editor.view, GO_TO_RATIO);
}

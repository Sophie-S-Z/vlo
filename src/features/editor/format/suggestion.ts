import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import type { Pass } from '@/lib/db';

/* The suggestion mark of Track changes (F44), for code that has no editor, such as exports and counts. */

export const SUGGESTION = 'suggestion';

/** A transaction with this meta keeps its content as it is, such as a snapshot restore or an accept. */
export const SKIP_TRACKING = 'vloSkipTracking';

export type ChangeKind = 'insert' | 'delete';

export interface SuggestionAttrs {
  id: string;
  kind: ChangeKind;
  pass: Pass;
  /** When the change was made, in milliseconds. */
  at: number;
  /** Who made it, such as an editor's name from a Word file. Empty for the writer. */
  by: string;
}

/** The document with every suggestion accepted: deleted words out and inserted words kept. */
export function acceptedDoc(doc: ProseMirrorNode): ProseMirrorNode {
  const type = doc.type.schema.marks[SUGGESTION];
  if (!type) return doc;
  const ranges: [number, number][] = [];
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    if (type.isInSet(node.marks)?.attrs.kind === 'delete') ranges.push([pos, pos + node.nodeSize]);
    return false;
  });
  if (ranges.length === 0) return doc;
  const tr = new Transform(doc);
  for (const [from, to] of ranges.reverse()) tr.delete(from, to);
  return tr.doc;
}

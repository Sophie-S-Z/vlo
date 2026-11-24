import type * as Y from 'yjs';

/*
 * The schema version of an item document. Raise it with every new node, mark or attribute that an older
 * build cannot show. An older build drops content it cannot show, and Yjs then saves that loss, so a
 * build never binds an editor to a document newer than its own schema. 1 is Phase 1; 2 adds the Phase 2
 * formats (styles, colors, gradient text and footnotes); 3 adds equations; 4 adds private names; 5 adds the aiOrigin mark;
 * 6 adds comments; 7 adds suggestions and the comment's author; 8 adds the script line (F63); 9 adds the
 * citation (F64); 10 adds the image (Phase 16); 11 adds the image between the stanzas of a poem; 12 adds Heading 4, the checklist and the page break (Phase 19); 13 adds the replies and
 * the resolve time of a comment (Phase 19, Task C1); 14 adds the paragraph style of a paragraph (Phase 19, Task E2); 15 adds the link to an item and
 * the anchor of a heading (Task F1), and the table (Task F2).
 */
export const DOC_SCHEMA = 15;

const META = 'vlo';
const KEY = 'schema';

/** The schema version stored in the document. Documents from Phase 1 have none and count as 1. */
export function docSchema(doc: Y.Doc): number {
  const value = doc.getMap(META).get(KEY);
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
}

/** Puts the schema version that `from` stores in `to`, for a copy of the content. */
export function copyDocSchema(from: Y.Doc, to: Y.Doc): void {
  const value: unknown = from.getMap(META).get(KEY);
  if (value !== undefined) to.getMap(META).set(KEY, value);
}

/** Records this build's schema version in the document, once, when the writer changes it. */
export function stampDocSchema(doc: Y.Doc): void {
  if (docSchema(doc) < DOC_SCHEMA) doc.getMap(META).set(KEY, DOC_SCHEMA);
}

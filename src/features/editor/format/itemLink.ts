import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/*
 * Links between items (Phase 19, Task F1). A link is an inline atom that holds the id of its item, the
 * anchor of a heading in that item or none, and the title at the time of the link. It shows the current
 * title, so a rename changes each link at once. This file has no editor code, so the export worker can
 * import it.
 */

export const ITEM_LINK = 'itemLink';

const ITEM_ID = /^[A-Za-z0-9-]{1,64}$/;
const ANCHOR = /^h-[a-z0-9]{8}$/;

/** The item id of a link, or null when it is not one that Vlo makes. */
export function cleanItemId(value: unknown): string | null {
  return typeof value === 'string' && ITEM_ID.test(value) ? value : null;
}

/** The anchor of a heading, such as "h-3f9a01bc", or null. */
export function cleanAnchor(value: unknown): string | null {
  return typeof value === 'string' && ANCHOR.test(value) ? value : null;
}

export function newAnchor(): string {
  return `h-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/** The title that a link shows: "Untitled item" for an item with no title. */
export function shownTitle(title: string): string {
  return title.trim() === '' ? 'Untitled item' : title;
}

/** The text of a link: the item title, then the heading after "›" when the link goes to a heading. */
export function linkLabel(title: string, heading?: string): string {
  return heading ? `${title} › ${heading}` : title;
}

/** The plain text of a link node, for search, the text copy and a readable backup. */
export function linkText(attrs: Record<string, unknown>): string {
  return typeof attrs.label === 'string' ? attrs.label : '';
}

/** A heading of an item, for the link list. A heading gets its anchor when a link first goes to it. */
export interface HeadingRef {
  text: string;
  anchor?: string;
}

/** What the links of a project need from one item: the items it links to, and its headings. */
export interface LinkIndex {
  links: string[];
  headings: HeadingRef[];
}

/** The items that a document links to, each once, and its headings in order. */
export function linkIndexOf(doc: ProseMirrorNode): LinkIndex {
  const links = new Set<string>();
  const headings: HeadingRef[] = [];
  doc.descendants((node) => {
    if (node.type.name === ITEM_LINK) {
      const id = cleanItemId(node.attrs.item);
      if (id !== null) links.add(id);
    } else if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      const anchor = cleanAnchor(node.attrs.anchor);
      if (text !== '') headings.push(anchor === null ? { text } : { text, anchor });
    }
  });
  return { links: [...links], headings };
}

/** The position of the heading with the anchor, or -1. */
export function anchorPos(doc: ProseMirrorNode, anchor: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === 'heading' && node.attrs.anchor === anchor) found = pos;
    return !node.isTextblock;
  });
  return found;
}

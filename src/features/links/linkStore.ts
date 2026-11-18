import type { Editor } from '@tiptap/core';
import { useSyncExternalStore } from 'react';
import {
  anchorPos,
  linkLabel,
  shownTitle,
  type HeadingRef,
  type LinkIndex,
} from '@/features/editor/format/itemLink';
import { goToBlock } from '@/features/editor/itemOutline';
import { db } from '@/lib/db';

/*
 * The links between the items of the open project (Phase 19, Task F1). The project screen gives the items
 * that a link can open. The text copy of each item keeps the items it links to and its headings, so the
 * "Links here" list and the link list come at once, with no item text open. A link opens its item through
 * the project screen, in the left pane or beside it.
 */

export interface LinkState {
  projectId: string | null;
  /** The items that a link can open, in binder order: id to title. */
  items: ReadonlyMap<string, string>;
  /** The links and the headings of each item, by item id. */
  index: ReadonlyMap<string, LinkIndex>;
  /** True once the index of the project is read, so each heading of a link is known. */
  ready: boolean;
}

/** Where a link goes. */
export interface LinkTarget {
  item: string;
  heading?: string;
}

/** How the project screen opens an item: in the left pane, and beside it on a wide screen. */
export interface LinkOpener {
  open: (itemId: string) => void;
  beside?: (itemId: string) => void;
}

const EMPTY: LinkState = { projectId: null, items: new Map(), index: new Map(), ready: false };
let state = EMPTY;
let itemsKey = '';
let opener: LinkOpener | null = null;
/** The open editor of each item, so a link to an open item goes to its heading there. */
const editors = new Map<string, Editor>();
/** The heading that an item goes to when its editor opens. */
let pending: { item: string; anchor: string } | null = null;
const listeners = new Set<() => void>();

function set(next: LinkState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getLinks(): LinkState {
  return state;
}

export function subscribeLinks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLinks(): LinkState {
  return useSyncExternalStore(subscribeLinks, getLinks, getLinks);
}

/** Reads the link index of the project from the text copies, or clears it when no project is open. */
export async function openLinks(projectId: string | null): Promise<void> {
  if (projectId === state.projectId) return;
  itemsKey = '';
  set({ ...EMPTY, projectId });
  if (projectId === null) return;
  const texts = await db.itemTexts.where('projectId').equals(projectId).toArray();
  if (state.projectId !== projectId) return;
  const index = new Map(state.index);
  for (const t of texts)
    if (!index.has(t.itemId)) index.set(t.itemId, { links: t.links ?? [], headings: t.headings ?? [] });
  set({ ...state, index, ready: true });
}

/** The items that a link can open, from the project screen. Only a new list or a new title sets it. */
export function setLinkItems(items: readonly { id: string; title: string }[]): void {
  const key = items.map((i) => `${i.id}\u0000${i.title}`).join('\u0001');
  if (key === itemsKey) return;
  itemsKey = key;
  set({ ...state, items: new Map(items.map((i) => [i.id, i.title])) });
}

/** Keeps the links and headings of an item after a save of its text copy. */
export function noteLinkIndex(projectId: string, itemId: string, next: LinkIndex): void {
  if (projectId !== state.projectId) return;
  const before = state.index.get(itemId);
  if (before && JSON.stringify(before) === JSON.stringify(next)) return;
  set({ ...state, index: new Map(state.index).set(itemId, next) });
}

/** Gives a heading of the index its new anchor at once, so a new link shows the heading before the save. */
export function noteAnchor(itemId: string, index: number, anchor: string): void {
  const before = state.index.get(itemId);
  const heading = before?.headings[index];
  if (!before || !heading || heading.anchor !== undefined) return;
  const headings = before.headings.map((h, i) => (i === index ? { ...h, anchor } : h));
  set({ ...state, index: new Map(state.index).set(itemId, { ...before, headings }) });
}

/** The items whose text links to the item, in binder order. */
export function linksTo(itemId: string, links: LinkState = state): { id: string; title: string }[] {
  return [...links.items].flatMap(([id, title]) =>
    id !== itemId && links.index.get(id)?.links.includes(itemId) ? [{ id, title }] : [],
  );
}

/** The headings of an item, from its text copy. */
export function headingsOf(itemId: string): readonly HeadingRef[] {
  return state.index.get(itemId)?.headings ?? [];
}

/**
 * The text that a link shows, and whether its item is gone. A link to a heading that is gone shows the
 * item title only.
 */
export function linkShows(target: LinkTarget, label: string): { text: string; broken: boolean } {
  const stored = state.items.get(target.item);
  if (stored === undefined) return { text: label === '' ? 'Missing item' : label, broken: true };
  const title = shownTitle(stored);
  const heading =
    target.heading === undefined
      ? undefined
      : headingsOf(target.item).find((h) => h.anchor === target.heading);
  return { text: linkLabel(title, heading?.text), broken: false };
}

export function setLinkOpener(next: LinkOpener | null): void {
  opener = next;
}

/** True when the project screen can open an item beside the left pane, as on a wide screen. */
export function canOpenBeside(): boolean {
  return opener?.beside !== undefined;
}

/** Keeps the editor of an item while it is open, for links that go to one of its headings. */
export function registerLinkEditor(itemId: string, editor: Editor): () => void {
  editors.set(itemId, editor);
  return () => {
    if (editors.get(itemId) === editor) editors.delete(itemId);
  };
}

/** The open editor of an item, or undefined. */
export function linkEditor(itemId: string): Editor | undefined {
  const editor = editors.get(itemId);
  return editor && !editor.isDestroyed ? editor : undefined;
}

/** Puts the caret in the heading with the anchor and scrolls to it. False when the text has no such heading. */
function goToAnchor(editor: Editor, anchor: string): boolean {
  if (editor.isDestroyed) return false;
  const pos = anchorPos(editor.state.doc, anchor);
  if (pos < 0) return false;
  goToBlock(editor, pos);
  return true;
}

/**
 * Opens the item of a link, beside the left pane with `beside`. A link to a heading of an open item goes to
 * the heading there, and an item that opens goes to it once its text shows.
 */
export function followLink(target: LinkTarget, beside = false): void {
  if (!state.items.has(target.item)) return;
  const open = linkEditor(target.item);
  if (open) {
    if (target.heading === undefined || !goToAnchor(open, target.heading)) open.commands.focus();
    return;
  }
  pending = target.heading === undefined ? null : { item: target.item, anchor: target.heading };
  const go = beside ? (opener?.beside ?? opener?.open) : opener?.open;
  go?.(target.item);
}

/** Goes to the heading that a link asked for, when the item's editor opens. True when it did. */
export function takeLinkAnchor(itemId: string, editor: Editor): boolean {
  if (pending?.item !== itemId) return false;
  const { anchor } = pending;
  pending = null;
  return goToAnchor(editor, anchor);
}

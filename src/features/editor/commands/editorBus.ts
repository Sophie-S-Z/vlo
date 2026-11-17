import type { Editor } from '@tiptap/core';
import { useSyncExternalStore } from 'react';
import type { EditorForm, EditorCommand, PanelId } from './registry';

/*
 * Two small stores the editor shares with the rest of the project screen: the editor that is open now (in a
 * split view, the one whose text has focus), so the command menu can run format commands, and the panel that
 * is open, so any surface (toolbar, selection menu, / menu, command menu) can open the same panel.
 */

export interface ActiveEditor {
  editor: Editor;
  form: EditorForm;
  /** The item of the text. */
  itemId?: string;
}

/** Where a panel sits: under a toolbar button, or at the caret. */
export type PanelAnchor = HTMLElement | 'caret';

export interface PanelRequest {
  editor: Editor;
  panel: PanelId;
  anchor: PanelAnchor;
}

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const active = createStore<ActiveEditor | null>(null);
const panel = createStore<PanelRequest | null>(null);

/** An open find bar: its editor and the field that takes focus. `at` changes on each request. */
export interface FindRequest {
  editor: Editor;
  field: 'find' | 'replace';
  at: number;
}

const find = createStore<FindRequest | null>(null);
let findRequests = 0;

/** Opens the find bar of this editor, or moves focus to the field again when it is open. */
export function openFind(editor: Editor, field: 'find' | 'replace'): void {
  findRequests += 1;
  find.set({ editor, field, at: findRequests });
}

export function closeFind(): void {
  find.set(null);
}

export function getFindRequest(): FindRequest | null {
  return find.get();
}

export function useFindRequest(): FindRequest | null {
  return useSyncExternalStore(find.subscribe, find.get, find.get);
}

export function setActiveEditor(next: ActiveEditor | null): void {
  active.set(next);
}

export function getActiveEditor(): ActiveEditor | null {
  return active.get();
}

export function useActiveEditor(): ActiveEditor | null {
  return useSyncExternalStore(active.subscribe, active.get, active.get);
}

export function openPanel(request: PanelRequest): void {
  panel.set(request);
}

export function closePanel(): void {
  panel.set(null);
}

export function getPanelRequest(): PanelRequest | null {
  return panel.get();
}

export function usePanelRequest(): PanelRequest | null {
  return useSyncExternalStore(panel.subscribe, panel.get, panel.get);
}

/**
 * What another screen asks an item's editor to show when it opens: some words, such as a reader's quote,
 * or a comment thread from a link.
 */
type ToShow =
  | {
      words: string;
      /** The top-level block where the words were, so the nearest place of the same words wins. */
      block: number;
    }
  | { comment: string };

let toShow: { itemId: string; what: ToShow } | null = null;

export function showWordsOnOpen(itemId: string, words: string, block: number): void {
  toShow = { itemId, what: { words, block } };
}

export function showCommentOnOpen(itemId: string, comment: string): void {
  toShow = { itemId, what: { comment } };
}

/** What the editor of this item must show, once. */
export function takeWordsToShow(itemId: string): ToShow | null {
  if (toShow?.itemId !== itemId) return null;
  const { what } = toShow;
  toShow = null;
  return what;
}

/** The address of a comment thread, for Copy link. The project page opens the item at the thread. */
export function commentLink(itemId: string, comment: string): string {
  const url = new URL(window.location.pathname, window.location.origin);
  url.search = new URLSearchParams({ item: itemId, comment }).toString();
  return url.toString();
}

/** Gives the text focus now. TipTap's own focus command waits a frame, and keys typed in that frame are lost. */
export function focusText(editor: Editor): void {
  if (!editor.isDestroyed && !editor.view.hasFocus()) editor.view.focus();
}

/** Runs a registry command from any surface. Run commands act at once; panel commands open their panel. */
export function runCommand(editor: Editor, cmd: EditorCommand, anchor: PanelAnchor = 'caret'): boolean {
  if (editor.isDestroyed) return false;
  if (cmd.kind === 'panel') {
    openPanel({ editor, panel: cmd.panel, anchor });
    return true;
  }
  focusText(editor);
  return cmd.run(editor);
}

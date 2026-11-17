import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import { Selection, TextSelection } from '@tiptap/pm/state';
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { safeStorage } from '@/app/preferences';
import { clock } from '@/lib/clock';

/*
 * The last place in each item, on this device (Phase 19, Task A2). An item opens with the caret where the
 * writer left it. The place is kept as Yjs relative positions, so an edit in another tab or on another
 * device before the caret keeps the caret on the same words.
 */

const KEY = 'vlo:places';
/** The places of the most recent items. Older places go first. */
export const MAX_PLACES = 300;

interface Place {
  /** The anchor and the head as Yjs relative positions (JSON). */
  anchor: unknown;
  head: unknown;
  /** The anchor and the head as numbers, for a document that the Yjs positions cannot read. */
  from: number;
  to: number;
  at: number;
}

type Places = Record<string, Place>;

function load(): Places {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Places;
  } catch {
    // A damaged value starts again with no places.
  }
  return {};
}

function store(places: Places): void {
  const kept = Object.entries(places)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_PLACES);
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Full or blocked storage: the item opens at the end next time, as before.
  }
}

/** The Yjs binding of the editor, or null when the editor has no Collaboration extension. */
function bindingOf(editor: Editor) {
  const sync = ySyncPluginKey.getState(editor.state);
  return sync?.binding ?? null;
}

/** Keeps the caret and the selection of the item. */
export function savePlace(itemId: string, editor: Editor): void {
  if (editor.isDestroyed) return;
  const binding = bindingOf(editor);
  const { anchor, head } = editor.state.selection;
  const relative = (pos: number): unknown =>
    binding
      ? (Y.relativePositionToJSON(
          absolutePositionToRelativePosition(pos, binding.type, binding.mapping),
        ) as unknown)
      : null;
  const places = load();
  places[itemId] = {
    anchor: relative(anchor),
    head: relative(head),
    from: anchor,
    to: head,
    at: clock.now(),
  };
  store(places);
}

/** The stored place of the item as document positions, or null when the item has none. */
export function placeOf(itemId: string, editor: Editor): { anchor: number; head: number } | null {
  const place = load()[itemId];
  if (!place) return null;
  const size = editor.state.doc.content.size;
  const binding = bindingOf(editor);
  const absolute = (json: unknown, fallback: number): number => {
    if (binding && json && typeof json === 'object') {
      try {
        const pos = relativePositionToAbsolutePosition(
          binding.doc,
          binding.type,
          Y.createRelativePositionFromJSON(json),
          binding.mapping,
        );
        if (pos !== null) return pos;
      } catch {
        // A damaged position falls back to the number.
      }
    }
    return fallback;
  };
  const clamp = (pos: number) => (Number.isFinite(pos) ? Math.min(Math.max(pos, 0), size) : size);
  return {
    anchor: clamp(absolute(place.anchor, place.from)),
    head: clamp(absolute(place.head, place.to)),
  };
}

/**
 * Puts the caret at the item's last place. False when the item has no place, so the caller can put the
 * caret at the end. A place inside a node that cannot hold a caret moves to the nearest text.
 */
export function restorePlace(itemId: string, editor: Editor): boolean {
  const place = placeOf(itemId, editor);
  if (!place) return false;
  const { doc } = editor.state;
  let selection: Selection;
  try {
    selection = TextSelection.create(doc, place.anchor, place.head);
    if (!selection.$anchor.parent.inlineContent || !selection.$head.parent.inlineContent)
      selection = Selection.near(doc.resolve(place.head));
  } catch {
    return false;
  }
  editor.view.dispatch(editor.state.tr.setSelection(selection).setMeta('addToHistory', false));
  return true;
}

/** The caret line sits this far down the visible area after an open, so the writer sees the words before it. */
const CARET_RATIO = 0.4;

/** Scrolls the window so the caret line is at 40 percent of the visible height. */
export function scrollToCaret(view: EditorView): void {
  const caret = view.coordsAtPos(view.state.selection.head);
  const visible = window.visualViewport?.height ?? window.innerHeight;
  const top = Math.max(0, window.scrollY + caret.top - visible * CARET_RATIO);
  if (Math.abs(top - window.scrollY) > 1) window.scrollTo({ top, behavior: 'instant' });
}

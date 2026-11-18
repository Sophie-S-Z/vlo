import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { EditorCommand } from '../commands/registry';
import { NODE_MARK } from '../textMap';

/*
 * The / menu. Typing "/" at the start of a block or after a space opens a list of tools. `menuPlugin`
 * also gives the @ menu its keys.
 */

/** An open menu after a trigger character, or a shut one. */
export interface MenuState<T> {
  /** The position of the trigger character, or null while the menu is shut. */
  from: number | null;
  query: string;
  matches: readonly T[];
  index: number;
}

type SlashState = MenuState<EditorCommand>;

interface SlashOptions {
  /** The tools that match a query, in the order to show them. */
  items: (query: string) => readonly EditorCommand[];
  /** Runs the chosen tool after the "/" and the query are gone. */
  onChoose: (cmd: EditorCommand, editor: Editor) => void;
  /** The id of the list element. Option i has the id `${listId}-${i}`. */
  listId: string;
}

type MenuMeta = { open: number } | { close: true } | { move: number } | { index: number };

export const slashKey = new PluginKey<SlashState>('slashMenu');

/** Queries longer than this are prose, not a tool name. */
const MAX_QUERY = 24;

/** True when a trigger typed at `pos` should open a menu: at a block start or after whitespace. */
function opensAt(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock) return false;
  if ($pos.parentOffset === 0) return true;
  const before = $pos.parent.textBetween($pos.parentOffset - 1, $pos.parentOffset, undefined, NODE_MARK);
  return /\s/.test(before);
}

/**
 * A menu that a trigger opens: "/" for the tools, "@" for the Codex and the items (Phase 19, Task D4),
 * and "[[" for links to items and headings (Task F1). More letters filter it. Arrow keys move, Enter or
 * Tab chooses, and Escape closes the list and keeps the trigger. The editor keeps focus the whole time,
 * and aria-activedescendant names the choice.
 */
export function menuPlugin<T>(options: {
  key: PluginKey<MenuState<T>>;
  trigger: string;
  editor: Editor;
  items: (query: string) => readonly T[];
  /** Runs after the trigger and the query are gone. */
  onChoose: (item: T) => void;
  listId: string;
  /** False while the menu is off, so the trigger stays a plain character. */
  enabled?: () => boolean;
}): Plugin<MenuState<T>> {
  const { key, trigger, editor, items, onChoose, listId, enabled = () => true } = options;
  const shut: MenuState<T> = { from: null, query: '', matches: [], index: 0 };
  return new Plugin<MenuState<T>>({
    key,
    state: {
      init: () => shut,
      apply(tr, prev, _old, next): MenuState<T> {
        const meta = tr.getMeta(key) as MenuMeta | undefined;
        if (meta && 'close' in meta) return shut;
        let from = prev.from;
        if (meta && 'open' in meta) from = meta.open;
        else if (from !== null && tr.docChanged) from = tr.mapping.map(from);
        if (from === null) return shut;

        const { selection } = next;
        if (!selection.empty || selection.from <= from) return shut;
        const $trigger = next.doc.resolve(from);
        const $head = selection.$head;
        if ($head.parent !== $trigger.parent) return shut;
        if (next.doc.textBetween(from, from + trigger.length) !== trigger) return shut;
        const query = next.doc.textBetween(from + trigger.length, selection.from, '\n', NODE_MARK);
        if (query.length > MAX_QUERY || /^\s/.test(query) || query.includes('\n')) return shut;
        const matches = query === prev.query && prev.from !== null ? prev.matches : items(query);
        // A space after a query that matches nothing means the writer is typing prose.
        if (matches.length === 0 && /\s$/.test(query)) return shut;
        let index = query === prev.query ? prev.index : 0;
        if (meta && 'move' in meta && matches.length > 0) {
          index = (index + meta.move + matches.length) % matches.length;
        }
        if (meta && 'index' in meta) index = Math.min(Math.max(meta.index, 0), matches.length - 1);
        return { from, query, matches, index: Math.max(0, Math.min(index, matches.length - 1)) };
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        // A trigger of two characters, such as "[[", opens on its last one.
        const lead = trigger.slice(0, -1);
        const start = from - lead.length;
        if (text !== trigger.slice(-1) || from !== to || !editor.isEditable || !enabled()) return false;
        if (start < 0 || view.state.doc.textBetween(start, from, undefined, NODE_MARK) !== lead) return false;
        if (!opensAt(view.state, start)) return false;
        view.dispatch(view.state.tr.insertText(text, from, to).setMeta(key, { open: start }));
        return true;
      },
      handleKeyDown(view, event) {
        const state = key.getState(view.state);
        if (state?.from === undefined || state.from === null) return false;
        const move = (delta: number) => {
          view.dispatch(view.state.tr.setMeta(key, { move: delta }));
          return true;
        };
        if (event.key === 'ArrowDown') return move(1);
        if (event.key === 'ArrowUp') return move(-1);
        if (event.key === 'Home' && state.matches.length > 0) {
          view.dispatch(view.state.tr.setMeta(key, { index: 0 }));
          return true;
        }
        if (event.key === 'End' && state.matches.length > 0) {
          view.dispatch(view.state.tr.setMeta(key, { index: state.matches.length - 1 }));
          return true;
        }
        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(key, { close: true }));
          return true;
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
          const chosen = state.matches[state.index];
          if (chosen === undefined) {
            view.dispatch(view.state.tr.setMeta(key, { close: true }));
            return false;
          }
          chooseFromMenu(view, key, state, chosen, onChoose);
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        blur(view) {
          // A click on a list option keeps focus (mousedown is cancelled), so a blur means the writer left.
          if (key.getState(view.state)?.from != null)
            view.dispatch(view.state.tr.setMeta(key, { close: true }));
          return false;
        },
      },
      attributes(state): Record<string, string> {
        const menu = key.getState(state);
        if (menu?.from === undefined || menu.from === null) return {};
        const attrs: Record<string, string> = { 'aria-controls': listId };
        if (menu.matches.length > 0) attrs['aria-activedescendant'] = `${listId}-${String(menu.index)}`;
        return attrs;
      },
    },
  });
}

export const SlashMenu = Extension.create<SlashOptions>({
  name: 'slashMenu',
  // Before EscapeTab and the poem's Tab key, so the open menu takes Escape, Tab and Enter first.
  priority: 10001,

  addOptions() {
    return { items: () => [], onChoose: () => undefined, listId: 'vlo-slash' };
  },

  addProseMirrorPlugins() {
    const { items, onChoose, listId } = this.options;
    const editor = this.editor;
    return [
      menuPlugin<EditorCommand>({
        key: slashKey,
        trigger: '/',
        editor,
        items,
        listId,
        onChoose: (cmd) => {
          onChoose(cmd, editor);
        },
      }),
    ];
  },
});

/** Removes the trigger and the query, and runs the choice. The query ends at the caret. */
export function chooseFromMenu<T>(
  view: EditorView,
  key: PluginKey<MenuState<T>>,
  state: MenuState<T>,
  item: T,
  onChoose: (item: T) => void,
): void {
  if (state.from === null) return;
  view.dispatch(view.state.tr.delete(state.from, view.state.selection.from).setMeta(key, { close: true }));
  onChoose(item);
}

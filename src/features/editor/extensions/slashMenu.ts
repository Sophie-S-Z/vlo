import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { EditorCommand } from '../commands/registry';

/*
 * The / menu. Typing "/" at the start of a block or after a space opens a list of tools. More letters
 * filter it. Arrow keys move, Enter or Tab runs the tool, and Escape closes the list and keeps the "/".
 * The editor keeps focus the whole time, and aria-activedescendant names the chosen tool.
 */

export interface SlashState {
  /** The position of the "/" character, or null while the menu is shut. */
  from: number | null;
  query: string;
  matches: readonly EditorCommand[];
  index: number;
}

export interface SlashOptions {
  /** The tools that match a query, in the order to show them. */
  items: (query: string) => readonly EditorCommand[];
  /** Runs the chosen tool after the "/" and the query are gone. */
  onChoose: (cmd: EditorCommand, editor: Editor) => void;
  /** The id of the list element. Option i has the id `${listId}-${i}`. */
  listId: string;
}

type SlashMeta = { open: number } | { close: true } | { move: number } | { index: number };

export const slashKey = new PluginKey<SlashState>('slashMenu');

const SHUT: SlashState = { from: null, query: '', matches: [], index: 0 };
/** Queries longer than this are prose, not a tool name. */
const MAX_QUERY = 24;

/** True when "/" typed at `pos` should open the menu: at a block start or after whitespace. */
function opensAt(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock) return false;
  if ($pos.parentOffset === 0) return true;
  const before = $pos.parent.textBetween($pos.parentOffset - 1, $pos.parentOffset, undefined, '￼');
  return /\s/.test(before);
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
      new Plugin<SlashState>({
        key: slashKey,
        state: {
          init: () => SHUT,
          apply(tr, prev, _old, next): SlashState {
            const meta = tr.getMeta(slashKey) as SlashMeta | undefined;
            if (meta && 'close' in meta) return SHUT;
            let from = prev.from;
            if (meta && 'open' in meta) from = meta.open;
            else if (from !== null && tr.docChanged) from = tr.mapping.map(from);
            if (from === null) return SHUT;

            const { selection } = next;
            if (!selection.empty || selection.from <= from) return SHUT;
            const $slash = next.doc.resolve(from);
            const $head = selection.$head;
            if ($head.parent !== $slash.parent) return SHUT;
            if (next.doc.textBetween(from, from + 1) !== '/') return SHUT;
            const query = next.doc.textBetween(from + 1, selection.from, '\n', '￼');
            if (query.length > MAX_QUERY || /^\s/.test(query) || query.includes('\n')) return SHUT;

            const matches = query === prev.query && prev.from !== null ? prev.matches : items(query);
            // A space after a query that matches nothing means the writer is typing prose.
            if (matches.length === 0 && /\s$/.test(query)) return SHUT;
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
            if (text !== '/' || from !== to || !editor.isEditable) return false;
            if (!opensAt(view.state, from)) return false;
            view.dispatch(view.state.tr.insertText('/', from, to).setMeta(slashKey, { open: from }));
            return true;
          },
          handleKeyDown(view, event) {
            const state = slashKey.getState(view.state);
            if (state?.from === undefined || state.from === null) return false;
            const move = (delta: number) => {
              view.dispatch(view.state.tr.setMeta(slashKey, { move: delta }));
              return true;
            };
            if (event.key === 'ArrowDown') return move(1);
            if (event.key === 'ArrowUp') return move(-1);
            if (event.key === 'Home' && state.matches.length > 0) {
              view.dispatch(view.state.tr.setMeta(slashKey, { index: 0 }));
              return true;
            }
            if (event.key === 'End' && state.matches.length > 0) {
              view.dispatch(view.state.tr.setMeta(slashKey, { index: state.matches.length - 1 }));
              return true;
            }
            if (event.key === 'Escape') {
              view.dispatch(view.state.tr.setMeta(slashKey, { close: true }));
              return true;
            }
            if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
              const chosen = state.matches[state.index];
              if (!chosen) {
                view.dispatch(view.state.tr.setMeta(slashKey, { close: true }));
                return false;
              }
              chooseSlash(view, state, chosen, (c) => {
                onChoose(c, editor);
              });
              return true;
            }
            return false;
          },
          handleDOMEvents: {
            blur(view) {
              // A click on a list option keeps focus (mousedown is cancelled), so a blur means the writer left.
              if (slashKey.getState(view.state)?.from != null) {
                view.dispatch(view.state.tr.setMeta(slashKey, { close: true }));
              }
              return false;
            },
          },
          attributes(state): Record<string, string> {
            const slash = slashKey.getState(state);
            if (slash?.from === undefined || slash.from === null) return {};
            const attrs: Record<string, string> = { 'aria-controls': listId };
            if (slash.matches.length > 0) attrs['aria-activedescendant'] = `${listId}-${String(slash.index)}`;
            return attrs;
          },
        },
      }),
    ];
  },
});

/** Removes "/query" and runs the tool. */
export function chooseSlash(
  view: EditorView,
  state: SlashState,
  cmd: EditorCommand,
  onChoose: (cmd: EditorCommand) => void,
): void {
  if (state.from === null) return;
  const end = state.from + 1 + state.query.length;
  view.dispatch(view.state.tr.delete(state.from, end).setMeta(slashKey, { close: true }));
  onChoose(cmd);
}

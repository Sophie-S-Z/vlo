import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CODEX_KINDS } from '@/features/codex/codex';
import { getCodex } from '@/features/codex/codexStore';
import { getLinks } from '@/features/links/linkStore';
import { ITEM_LINK } from '../format/itemLink';
import { getWritingPrefs } from '../writingPrefs';
import { insertLink } from './itemLink';
import { menuPlugin, type MenuState } from './slashMenu';

/*
 * Codex names as the writer types (Phase 19, Task D4). After three letters that start a Codex name or
 * alias, the rest of the name shows faintly after the caret, and Tab takes it. "@" lists the Codex entries
 * and the items, and a choice puts the name in the text. In prose, an item of the project becomes a link
 * to it (Task F1). Both read only the writer's own Codex on the
 * device, so they work in every AI mode, Pen included.
 */

/** The letters that a name needs before its completion shows. */
export const MIN_LETTERS = 3;
/** The completion shows after this pause in typing. */
export const COMPLETION_PAUSE_MS = 300;
/** The most names that the @ list shows. */
const MAX_MENTIONS = 8;

interface Completion {
  /** The caret, where the faint rest of the name starts. */
  at: number;
  /** The letters that the writer typed. */
  word: string;
  name: string;
}

export interface Mention {
  id: string;
  name: string;
  /** What the name is, such as "Character" or "Item". */
  kind: string;
  /** True for an item of the project, which makes a link in prose (Task F1). */
  item?: true;
}

export const completionKey = new PluginKey<Completion | null>('vloCodexCompletion');
export const mentionKey = new PluginKey<MenuState<Mention>>('vloMention');

const LAST_WORD = new RegExp(`(?<![\\p{L}\\p{N}'’-])[\\p{L}\\p{N}'’-]{${String(MIN_LETTERS)},}$`, 'u');

/** The first Codex name or alias that starts with the word and is longer: the shortest, then A to Z. */
export function completionFor(word: string, names: readonly string[]): string | null {
  const start = word.toLowerCase();
  let best: string | null = null;
  for (const name of names) {
    if (name.length <= word.length || !name.toLowerCase().startsWith(start)) continue;
    if (best === null || name.length < best.length || (name.length === best.length && name < best))
      best = name;
  }
  return best;
}

const on = () => getWritingPrefs().codexCompletion && getCodex().projectId !== null;

/** The completion at the caret of the state, or null. */
function completionAt(state: EditorState): Completion | null {
  const { selection } = state;
  if (!selection.empty || !selection.$from.parent.isTextblock) return null;
  const { parent, parentOffset } = selection.$from;
  const after = parent.textBetween(parentOffset, Math.min(parentOffset + 1, parent.content.size), '', '￼');
  // A completion never splits a word.
  if (/[\p{L}\p{N}]/u.test(after)) return null;
  const word = LAST_WORD.exec(parent.textBetween(0, parentOffset, '', '￼'))?.[0];
  if (word === undefined) return null;
  const names = getCodex().entries.flatMap((entry) => [entry.name, ...entry.aliases]);
  const name = completionFor(word, names);
  return name === null ? null : { at: selection.from, word, name };
}

/** The Codex entries, then the items, whose names hold the query. */
export function mentionsFor(query: string): Mention[] {
  const codex = getCodex();
  const q = query.trim().toLowerCase();
  const kinds = new Map<string, string>(CODEX_KINDS.map((k) => [k.id, k.label]));
  const entries = codex.entries
    .filter((e) => [e.name, ...e.aliases].some((n) => n.toLowerCase().includes(q)))
    .map((e) => ({ id: e.id, name: e.name, kind: kinds.get(e.kind) ?? 'Codex' }));
  const items = [...codex.titles]
    .filter(([, title]) => title.trim() !== '' && title.toLowerCase().includes(q))
    .map(([id, title]): Mention => ({ id, name: title, kind: 'Item', item: true }));
  return [...entries, ...items].slice(0, MAX_MENTIONS);
}

/** Puts the chosen name at the caret: a link for an item of the project in prose, else plain text. */
export function insertMention(editor: Editor, mention: Mention): void {
  if (mention.item && ITEM_LINK in editor.schema.nodes && getLinks().items.has(mention.id)) {
    insertLink(editor, { item: mention.id, title: mention.name });
    return;
  }
  editor.chain().focus().insertContent({ type: 'text', text: mention.name }).run();
}

export const CodexCompletion = Extension.create<{ listId: string }>({
  name: 'codexCompletion',
  // Before the list keys and the poem's Tab key, so a shown completion takes Tab first.
  priority: 10000,

  addOptions() {
    return { listId: 'vlo-mention' };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<Completion | null>({
        key: completionKey,
        state: {
          init: () => null,
          apply: (tr, value) => {
            const meta = tr.getMeta(completionKey) as { show: Completion | null } | undefined;
            if (meta) return meta.show;
            return tr.docChanged || tr.selectionSet ? null : value;
          },
        },
        props: {
          decorations: (state) => {
            const shown = completionKey.getState(state);
            if (!shown) return DecorationSet.empty;
            const ghost = () => {
              const span = document.createElement('span');
              span.className = 'vlo-completion';
              span.setAttribute('aria-hidden', 'true');
              span.textContent = shown.name.slice(shown.word.length);
              return span;
            };
            return DecorationSet.create(state.doc, [
              Decoration.widget(shown.at, ghost, { side: 1, key: shown.name }),
            ]);
          },
          handleKeyDown: (view, event) => {
            const shown = completionKey.getState(view.state);
            if (!shown) return false;
            if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
              const tr = view.state.tr.insertText(shown.name, shown.at - shown.word.length, shown.at);
              view.dispatch(tr.setMeta(completionKey, { show: null }));
              return true;
            }
            if (event.key === 'Escape') {
              view.dispatch(view.state.tr.setMeta(completionKey, { show: null }));
              return true;
            }
            return false;
          },
        },
        view: (view) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          // Screen readers hear the completion, because the faint text is hidden from them.
          const live = document.createElement('div');
          live.className = 'sr-only';
          live.setAttribute('role', 'status');
          document.body.append(live);
          return {
            update: (next, previous) => {
              const shown = completionKey.getState(next.state);
              live.textContent = shown ? `Completion: ${shown.name}. Press Tab to accept.` : '';
              if (next.state.doc === previous.doc && next.state.selection.eq(previous.selection)) return;
              clearTimeout(timer);
              if (!on() || !next.hasFocus()) return;
              timer = setTimeout(() => {
                if (view.isDestroyed || !view.hasFocus()) return;
                const found = completionAt(view.state);
                if (found) view.dispatch(view.state.tr.setMeta(completionKey, { show: found }));
              }, COMPLETION_PAUSE_MS);
            },
            destroy: () => {
              clearTimeout(timer);
              live.remove();
            },
          };
        },
      }),
      menuPlugin<Mention>({
        key: mentionKey,
        trigger: '@',
        editor,
        listId: this.options.listId,
        enabled: on,
        items: mentionsFor,
        onChoose: (mention) => {
          insertMention(editor, mention);
        },
      }),
    ];
  },
});

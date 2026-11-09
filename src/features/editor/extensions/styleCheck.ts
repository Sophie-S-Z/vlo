import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { styleNotes, type StyleKind, type StyleNote } from '@/features/analysis/style';
import { SAVE_PAUSE_MS } from '../saveTracker';
import { getWritingPrefs, subscribeWritingPrefs } from '../writingPrefs';

/*
 * The style check in the text (roadmap F47, plan Task H4). Decorations mark the words, so the text never
 * changes and nothing leaves the device. A scan runs after the save pause. It analyzes only the paragraphs
 * that changed: an unchanged paragraph is the same node, so its notes come from the cache.
 */

interface StyleState {
  /** English projects only, because the word lists are English. */
  english: boolean;
  /** The switch is on and the project is English. */
  on: boolean;
  decorations: DecorationSet;
}

const styleCheckKey = new PluginKey<StyleState>('vloStyleCheck');

/** The text of a paragraph or line with one character for each position, so a note's place is a position. */
function blockText(block: ProseMirrorNode): string {
  let text = '';
  block.forEach((child) => {
    if (child.isText) text += child.text ?? '';
    else text += child.type.name === 'hardBreak' ? '\n' : '￼'.repeat(child.nodeSize);
  });
  return text;
}

/** True when this editor can run the style check: the project is in English. */
export function canStyleCheck(state: EditorState): boolean {
  return styleCheckKey.getState(state)?.english ?? false;
}

/** The style note at the cursor, with its words, or null. A word's note wins over its sentence's note. */
export function styleNoteAt(state: EditorState): { kind: StyleKind; text: string } | null {
  const value = styleCheckKey.getState(state);
  if (!value?.on) return null;
  const at = state.selection.from;
  const found = value.decorations.find(at, at).sort((a, b) => a.to - a.from - (b.to - b.from))[0];
  if (!found) return null;
  return {
    kind: (found.spec as { kind: StyleKind }).kind,
    text: state.doc.textBetween(found.from, found.to, ' ', ' '),
  };
}

export const StyleCheck = Extension.create<{ form: 'prose' | 'poem'; english: boolean }>({
  name: 'styleCheck',

  addOptions() {
    return { form: 'prose', english: true };
  },

  addProseMirrorPlugins() {
    const { form, english } = this.options;
    const cache = new WeakMap<ProseMirrorNode, StyleNote[]>();
    const isOn = () => english && getWritingPrefs().styleCheck;

    const scan = (doc: ProseMirrorNode): DecorationSet => {
      const decorations: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        let notes = cache.get(node);
        if (!notes) {
          notes = styleNotes(blockText(node), form);
          cache.set(node, notes);
        }
        for (const note of notes)
          decorations.push(
            Decoration.inline(
              pos + 1 + note.from,
              pos + 1 + note.to,
              { class: `vlo-style vlo-style-${note.kind}` },
              { kind: note.kind },
            ),
          );
        return false;
      });
      return DecorationSet.create(doc, decorations);
    };

    return [
      new Plugin<StyleState>({
        key: styleCheckKey,
        state: {
          init: () => ({ english, on: isOn(), decorations: DecorationSet.empty }),
          apply: (tr, value, _old, state) => {
            if (tr.getMeta(styleCheckKey) !== undefined) {
              const on = isOn();
              return { english, on, decorations: on ? scan(state.doc) : DecorationSet.empty };
            }
            if (!tr.docChanged || !value.on) return value;
            // Until the next scan, the marks move with the text.
            return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => styleCheckKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        view: (view) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const rescan = () => {
            if (!view.isDestroyed)
              view.dispatch(view.state.tr.setMeta(styleCheckKey, true).setMeta('addToHistory', false));
          };
          const later = () => {
            clearTimeout(timer);
            timer = setTimeout(rescan, SAVE_PAUSE_MS);
          };
          if (isOn()) later();
          // The switch lives outside the editor. Turning it on or off scans or clears the marks at once.
          const stop = subscribeWritingPrefs(() => {
            if (isOn() !== styleCheckKey.getState(view.state)?.on) rescan();
          });
          return {
            update: (next, previous) => {
              if (next.state.doc !== previous.doc && styleCheckKey.getState(next.state)?.on) later();
            },
            destroy: () => {
              clearTimeout(timer);
              stop();
            },
          };
        },
      }),
    ];
  },
});

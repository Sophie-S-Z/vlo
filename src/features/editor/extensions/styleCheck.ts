import { Extension } from '@tiptap/core';
import { PluginKey, type EditorState } from '@tiptap/pm/state';
import { styleNotes, type StyleKind } from '@/features/analysis/style';
import { getWritingPrefs, subscribeWritingPrefs } from '../writingPrefs';
import { blockScanPlugin, scanMarksAt, type ScanState } from './blockScan';

/*
 * The style check in the text (roadmap F47, plan Task H4). The word lists are English, so only an English
 * project gets the check. Nothing leaves the device.
 */

const styleCheckKey = new PluginKey<ScanState>('vloStyleCheck');

/** True when this editor can run the style check: the project is in English. */
export function canStyleCheck(state: EditorState): boolean {
  return styleCheckKey.getState(state) !== undefined;
}

/** The style note at the cursor, with its words, or null. A word's note wins over its sentence's note. */
export function styleNoteAt(state: EditorState): { kind: StyleKind; text: string } | null {
  const found = scanMarksAt(styleCheckKey, state)[0];
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
    if (!english) return [];
    return [
      blockScanPlugin({
        key: styleCheckKey,
        inputs: () => (getWritingPrefs().styleCheck ? form : null),
        subscribe: subscribeWritingPrefs,
        marksOf: (text) =>
          styleNotes(text, form).map((note) => ({
            from: note.from,
            to: note.to,
            attrs: { class: `vlo-style vlo-style-${note.kind}` },
            spec: { kind: note.kind },
          })),
      }),
    ];
  },
});

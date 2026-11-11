import { Extension } from '@tiptap/core';
import { PluginKey, type EditorState } from '@tiptap/pm/state';
import {
  nameWords,
  continuityNotes,
  leftBefore,
  type ContinuityInput,
  type ContinuityNote,
} from '@/features/codex/continuity';
import { getCodex, subscribeCodex, type CodexState } from '@/features/codex/codexStore';
import { getWritingPrefs, subscribeWritingPrefs } from '../writingPrefs';
import { blockScanPlugin, scanMarksAt, type ScanState } from './blockScan';

/*
 * The continuity check in the text (roadmap 2 F66, plan Task N3). Off until the writer turns it on.
 * Rule 1 reads English capitals, so it runs only in an English project. Nothing leaves the device.
 */

const continuityKey = new PluginKey<ScanState>('vloContinuity');

/** The continuity mark at the cursor, or null. */
export function continuityNoteAt(state: EditorState): ContinuityNote | null {
  const found = scanMarksAt(continuityKey, state)[0];
  return found ? (found.spec as ContinuityNote) : null;
}

export const ContinuityCheck = Extension.create<{ itemId: string | undefined; english: boolean }>({
  name: 'continuityCheck',

  addOptions() {
    return { itemId: undefined, english: true };
  },

  addProseMirrorPlugins() {
    const { itemId, english } = this.options;
    if (itemId === undefined) return [];
    // One input for each state of the Codex store, so the scan runs again only when the store changes.
    let from: CodexState | null = null;
    let input: ContinuityInput | null = null;
    return [
      blockScanPlugin<ContinuityInput>({
        key: continuityKey,
        inputs: () => {
          if (!getWritingPrefs().continuityCheck) return null;
          const codex = getCodex();
          if (codex !== from || input === null) {
            from = codex;
            input = {
              match: codex.match,
              nearNames: english ? nameWords(codex.entries) : null,
              left: leftBefore(codex.entries, codex.places, itemId, new Set(codex.kept.scenes)),
              keptWords: new Set(codex.kept.words),
            };
          }
          return input;
        },
        subscribe: (listener) => {
          const stopPrefs = subscribeWritingPrefs(listener);
          const stopCodex = subscribeCodex(listener);
          return () => {
            stopPrefs();
            stopCodex();
          };
        },
        marksOf: (text, now) =>
          continuityNotes(text, now).map((note) => ({
            from: note.from,
            to: note.to,
            attrs: { class: 'vlo-continuity' },
            spec: note,
          })),
      }),
    ];
  },
});

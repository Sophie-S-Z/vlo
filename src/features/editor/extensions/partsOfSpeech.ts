import { Extension } from '@tiptap/core';
import { PluginKey, type EditorState } from '@tiptap/pm/state';
import { tagInWorker } from '@/features/pos/posClient';
import { getPosPrefs, subscribePosPrefs } from '@/features/pos/posPrefs';
import type { PosMark } from '@/features/pos/posTags';
import { blockCheckPlugin, type BlockCheckState } from './blockChecks';

/*
 * Parts-of-speech colors in an English item (Phase 19, Task D5). The tagger reads each paragraph near the
 * screen in a worker, after a pause in typing (blockChecks.ts). Each kind of word gets a color and a line
 * shape, and the legend turns each kind on or off.
 */

/** The colors show after this pause in typing. */
export const POS_PAUSE_MS = 800;

const posKey = new PluginKey<BlockCheckState>('vloPartsOfSpeech');

/** True when this editor can show the parts of speech: an English item. */
export function canShowPartsOfSpeech(state: EditorState): boolean {
  return posKey.getState(state) !== undefined;
}

export const PartsOfSpeech = Extension.create({
  name: 'partsOfSpeech',

  addProseMirrorPlugins() {
    return [
      blockCheckPlugin<PosMark>({
        key: posKey,
        isOn: () => getPosPrefs().on,
        pauseMs: POS_PAUSE_MS,
        run: tagInWorker,
        drawer: () => {
          const off = new Set(getPosPrefs().off);
          return (mark) => (off.has(mark.kind) ? null : { attrs: { class: `vlo-pos-${mark.kind}` } });
        },
        sources: [subscribePosPrefs],
      }),
    ];
  },
});

import { Extension } from '@tiptap/core';
import { PluginKey, type EditorState } from '@tiptap/pm/state';
import { getCodex, subscribeCodex, type CodexState } from '@/features/codex/codexStore';
import type { CodexEntry } from '@/lib/db';
import { blockScanPlugin, scanMarksAt, type ScanState } from './blockScan';

/*
 * Codex names in the text (roadmap F42 and the F38 word list, plan Task H5). Each name gets
 * spellcheck="false", so the browser does not mark it: a page cannot add a word to the browser's
 * dictionary. "Show Codex names" also gives each name a dotted line, and the cursor on one shows its entry.
 */

const codexNamesKey = new PluginKey<ScanState>('vloCodexNames');

/** The entry of the Codex name at the cursor while the names show, or null. */
export function codexEntryAt(state: EditorState): CodexEntry | null {
  const codex = getCodex();
  if (!codex.show) return null;
  const found = scanMarksAt(codexNamesKey, state)[0];
  const entryId = (found?.spec as { entryId?: string } | undefined)?.entryId;
  return codex.entries.find((entry) => entry.id === entryId) ?? null;
}

export const CodexNames = Extension.create({
  name: 'codexNames',

  addProseMirrorPlugins() {
    return [
      blockScanPlugin<CodexState>({
        key: codexNamesKey,
        inputs: () => {
          const codex = getCodex();
          return codex.projectId === null ? null : codex;
        },
        subscribe: subscribeCodex,
        marksOf: (text, codex) =>
          codex.match(text).map((m) => ({
            from: m.from,
            to: m.to,
            attrs: { spellcheck: 'false', ...(codex.show ? { class: 'vlo-codex' } : {}) },
            spec: { entryId: m.entryId },
          })),
      }),
    ];
  },
});

import { Extension } from '@tiptap/core';
import { ReplaceStep } from '@tiptap/pm/transform';
import type { Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { aiInsertKey, KEEP_AI_MARKS } from '@/features/editor/extensions/aiOrigin';
import { SKIP_TRACKING } from '@/features/editor/format/suggestion';
import { flushAll, noteChange, type Source } from './record';

/*
 * Counts the characters of each change in the editor by its source, for the authorship record (F54, plan
 * Task K5). Changes from Yjs (another tab, a sync, undo and redo) and restores of earlier text count
 * nothing, because the writer wrote those words before.
 */

/** The meta of a transaction that puts the writer's dictated words in the text. */
export const DICTATION = 'vloDictation';

/** The source of a change, or null for a change that is not new writing. */
export function sourceOf(tr: Transaction): Source | null {
  if (tr.getMeta(aiInsertKey) !== undefined) return 'ai';
  if (tr.getMeta(DICTATION) !== undefined) return 'dictated';
  if (
    tr.getMeta(ySyncPluginKey) !== undefined ||
    tr.getMeta(SKIP_TRACKING) !== undefined ||
    tr.getMeta(KEEP_AI_MARKS) !== undefined
  )
    return null;
  const ui: unknown = tr.getMeta('uiEvent');
  return ui === 'paste' || ui === 'drop' ? 'pasted' : 'typed';
}

/** The characters that a transaction adds and deletes. An equation or a note marker counts as one. */
export function changedCharacters(tr: Transaction): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  tr.steps.forEach((step, i) => {
    if (!(step instanceof ReplaceStep)) return;
    const before = tr.docs[i];
    if (before) deleted += before.textBetween(step.from, step.to, '', ' ').length;
    added += step.slice.content.textBetween(0, step.slice.content.size, '', ' ').length;
  });
  return { added, deleted };
}

const onHide = () => {
  if (document.visibilityState === 'hidden') void flushAll().catch(() => undefined);
};
const onPageHide = () => void flushAll().catch(() => undefined);
let editors = 0;

export const AuthorshipCount = Extension.create<{ projectId: string | null }>({
  name: 'authorshipCount',
  addOptions: () => ({ projectId: null }),
  onCreate() {
    editors += 1;
    if (editors > 1) return;
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
  },
  onDestroy() {
    editors -= 1;
    if (editors > 0) return;
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
  },
  onTransaction({ transaction }) {
    const { projectId } = this.options;
    if (!projectId || !transaction.docChanged) return;
    const source = sourceOf(transaction);
    if (!source) return;
    const { added, deleted } = changedCharacters(transaction);
    noteChange(projectId, source, added, deleted);
  },
});

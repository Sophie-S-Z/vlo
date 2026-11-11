import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useState } from 'react';
import { styleReason } from '@/features/analysis/style';
import { CODEX_KINDS, entryAt } from '@/features/codex/codex';
import { getCodex } from '@/features/codex/codexStore';
import { continuityReason, keepContinuity, sceneKey, type ContinuityNote } from '@/features/codex/continuity';
import { Button } from '@/ui/button';
import { codexEntryAt } from './extensions/codexNames';
import { continuityNoteAt } from './extensions/continuityCheck';
import { styleNoteAt } from './extensions/styleCheck';

/**
 * A line under the toolbar about the words at the cursor: why the continuity check (F66) or the style
 * check (F47) marks them, or the Codex entry of a name (F42). A click or the arrow keys put the cursor
 * there, so the mouse and the keyboard both show it. The live region stays in the page, so a screen
 * reader reads each new line. A Codex entry shows as it is at the open item (F65). A continuity mark has
 * "Not a problem", which keeps it in the project.
 */
export function CursorNote({ editor, itemId }: { editor: Editor; itemId: string | undefined }) {
  const [problem, setProblem] = useState('');
  const { text, continuity } = useEditorState({
    editor,
    selector: ({ editor: e }): { text: string; continuity: ContinuityNote | null } => {
      const codex = getCodex();
      const mark = continuityNoteAt(e.state);
      if (mark) {
        const name = codex.entries.find((entry) => entry.id === mark.entryId)?.name ?? '';
        const leftIn = codex.titles.get(mark.leftIn ?? '') ?? 'an earlier scene';
        return { text: continuityReason(mark, name, leftIn), continuity: mark };
      }
      const style = styleNoteAt(e.state);
      if (style) return { text: styleReason(style.kind, style.text, style.use), continuity: null };
      const found = codexEntryAt(e.state);
      if (!found) return { text: '', continuity: null };
      const entry = itemId === undefined ? found : entryAt(found, codex.places, itemId);
      const kind = CODEX_KINDS.find((k) => k.id === entry.kind)?.label ?? '';
      return {
        text: `${entry.name}, ${kind.toLowerCase()}${entry.note ? `: ${entry.note}` : '.'}`,
        continuity: null,
      };
    },
  });

  const keep = (mark: ContinuityNote) => {
    const projectId = getCodex().projectId;
    if (projectId === null || itemId === undefined) return;
    keepContinuity(
      projectId,
      mark.rule === 'near-name' ? { word: mark.word } : { scene: sceneKey(mark.entryId, itemId) },
    ).then(
      () => {
        setProblem('');
        editor.commands.focus();
      },
      () => {
        setProblem('Vlo could not save that on this device.');
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p role="status" className="text-sm text-muted empty:hidden" data-vlo-cursor-note="">
        {text}
      </p>
      {continuity && (
        <Button
          variant="ghost"
          className="px-2 pointer-fine:min-h-9"
          onClick={() => {
            keep(continuity);
          }}
        >
          Not a problem
        </Button>
      )}
      {problem && (
        <p role="alert" className="text-sm text-accent-text">
          {problem}
        </p>
      )}
    </div>
  );
}

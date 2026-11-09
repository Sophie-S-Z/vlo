import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { styleReason } from '@/features/analysis/style';
import { CODEX_KINDS } from '@/features/codex/codex';
import { codexEntryAt } from './extensions/codexNames';
import { styleNoteAt } from './extensions/styleCheck';

/**
 * A line under the toolbar about the words at the cursor: why the style check marks them (F47), or the
 * Codex entry of a name (F42). A click or the arrow keys put the cursor there, so the mouse and the
 * keyboard both show it. The live region stays in the page, so a screen reader reads each new line.
 */
export function CursorNote({ editor }: { editor: Editor }) {
  const note = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const style = styleNoteAt(e.state);
      if (style) return styleReason(style.kind, style.text);
      const entry = codexEntryAt(e.state);
      if (!entry) return '';
      const kind = CODEX_KINDS.find((k) => k.id === entry.kind)?.label ?? '';
      return `${entry.name}, ${kind.toLowerCase()}${entry.note ? `: ${entry.note}` : '.'}`;
    },
  });
  return (
    <p role="status" className="text-sm text-muted empty:hidden" data-vlo-cursor-note="">
      {note}
    </p>
  );
}

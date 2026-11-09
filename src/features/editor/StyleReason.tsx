import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { styleReason } from '@/features/analysis/style';
import { styleNoteAt } from './extensions/styleCheck';

/**
 * Why the style check marks the words at the cursor (F47). A click or the arrow keys put the cursor in
 * the marked words, so the mouse and the keyboard both show the reason. The live region stays in the page,
 * so a screen reader reads each new reason.
 */
export function StyleReason({ editor }: { editor: Editor }) {
  const reason = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const note = styleNoteAt(e.state);
      return note ? styleReason(note.kind, note.text) : '';
    },
  });
  return (
    <p role="status" className="text-sm text-muted empty:hidden" data-vlo-style-reason="">
      {reason}
    </p>
  );
}

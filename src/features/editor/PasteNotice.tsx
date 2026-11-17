import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Button } from '@/ui/button';
import { cleanPasteKey, keepOriginalLook } from './extensions/cleanPaste';

/**
 * A line under the toolbar after a clean paste that left out fonts, sizes or colors (Phase 19, Task B2).
 * It offers the original look until the next edit. The live region stays in the page, so a screen reader
 * reads it.
 */
export function PasteNotice({ editor }: { editor: Editor }) {
  const cleaned = useEditorState({
    editor,
    selector: ({ editor: e }) => Boolean(cleanPasteKey.getState(e.state)),
  });
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p role="status" className="text-sm text-muted empty:hidden">
        {cleaned ? 'Pasted with clean formatting.' : ''}
      </p>
      {cleaned && (
        <Button
          variant="ghost"
          className="px-2 pointer-fine:min-h-9"
          onClick={() => {
            keepOriginalLook(editor);
          }}
        >
          Keep the original look
        </Button>
      )}
    </div>
  );
}

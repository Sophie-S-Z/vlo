import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import { useEffect, useId } from 'react';
import type * as Y from 'yjs';
import { FocusTools } from '@/features/focus/focusExtension';
import { refreshFocus } from '@/features/focus/focusPlugin';
import { useFocusPrefs } from '@/features/focus/focusPrefs';
import { cn } from '@/ui/cn';
import { poemExtensions } from './extensions/poem';
import { proseExtensions } from './extensions/prose';
import { Toolbar } from './Toolbar';
import '@/styles/editor.css';

interface EditorProps {
  doc: Y.Doc;
  kind: 'prose' | 'poem';
  /** The accessible name, such as the item's title. */
  label: string;
  /** Puts the cursor at the end of the text when the editor opens. */
  focusOnOpen?: boolean;
  /** Receives the editor once it exists, and null when it goes. */
  onEditor?: (editor: TiptapEditor | null) => void;
}

const HELP = {
  prose: 'Press Escape, then Tab, to leave the text.',
  poem: 'Tab adds four spaces and Shift-Tab removes them. Enter on an empty line starts a new stanza. Press Escape, then Tab, to leave the poem.',
};

export function Editor({ doc, kind, label, focusOnOpen = false, onEditor }: EditorProps) {
  const helpId = useId();
  const editor = useEditor(
    {
      extensions: [
        ...(kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc)),
        FocusTools,
      ],
      enableInputRules: kind === 'prose',
      enablePasteRules: kind === 'prose',
      autofocus: focusOnOpen ? 'end' : false,
      // The toolbar reads editor state on its own, so a keystroke does not re-render this tree.
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          'aria-label': label,
          'aria-multiline': 'true',
          'aria-describedby': helpId,
          role: 'textbox',
          spellcheck: 'true',
          class: kind === 'poem' ? 'vlo-manuscript vlo-poem' : 'vlo-manuscript vlo-prose',
        },
      },
    },
    [doc, kind],
  );

  const focus = useFocusPrefs();
  // A focus switch changed: redraw the dimming and center the caret at once.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(refreshFocus(editor.state.tr));
  }, [editor, focus]);

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  return (
    <div className="grid gap-3">
      <Toolbar editor={editor} kind={kind} />
      <EditorContent editor={editor} className={cn(focus.typewriter && 'vlo-typewriter')} />
      <p id={helpId} className="text-xs text-muted">
        {HELP[kind]}
      </p>
    </div>
  );
}

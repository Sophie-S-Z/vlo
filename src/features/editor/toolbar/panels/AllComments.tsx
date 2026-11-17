import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useState } from 'react';
import { Button } from '@/ui/button';
import { Segmented } from '@/ui/segmented';
import { commentLink, focusText } from '../../commands/editorBus';
import { commentsOf, selectComment } from '../../extensions/comment';
import { ThreadCard } from '../../ThreadCard';

/*
 * All comments (Phase 19, Task C1, Mod-Alt-Shift-A): every thread of the item in text order, open or
 * resolved. Reopen puts a resolved thread back in the margin, on its words.
 */

type Show = 'open' | 'resolved';

const SHOW: { value: Show; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

export function AllComments({
  editor,
  itemId,
  onDone,
}: {
  editor: Editor;
  itemId: string | undefined;
  onDone: () => void;
}) {
  const [show, setShow] = useState<Show>('open');
  const threads = useEditorState({
    editor,
    selector: ({ editor: e }) => commentsOf(e.state),
  });
  const shown = threads.filter((t) => t.resolvedAt > 0 === (show === 'resolved'));
  return (
    <div className="grid gap-3">
      <Segmented label="Show" options={SHOW} value={show} onChange={setShow} />
      {shown.length === 0 ? (
        <p className="text-sm text-muted">
          {show === 'open' ? 'No open comments in this item.' : 'No resolved comments in this item.'}
        </p>
      ) : (
        <ol
          className="grid max-h-[60dvh] gap-2 overflow-y-auto"
          aria-label={show === 'open' ? 'Open comments' : 'Resolved comments'}
        >
          {shown.map((thread) => (
            <li key={thread.id} className="grid gap-2 rounded-[var(--radius-card)] border border-rule p-3">
              <ThreadCard
                editor={editor}
                thread={thread}
                open
                quote
                link={itemId ? commentLink(itemId, thread.id) : null}
              />
              <div>
                <Button
                  variant="ghost"
                  className="min-h-9 px-2 pointer-coarse:min-h-11"
                  onClick={() => {
                    if (!selectComment(editor, thread.id)) return;
                    onDone();
                    focusText(editor);
                  }}
                >
                  Go to the words
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import { commentLink } from '../../commands/editorBus';
import { commentAt, commentsOf } from '../../extensions/comment';
import { ThreadCard } from '../../ThreadCard';

/**
 * Adds a comment to the selected words (F43), or shows the thread at the cursor with its replies (Phase 19,
 * Task C1). `itemId` gives the thread its link.
 */
export function CommentPanel({
  editor,
  itemId,
  onDone,
}: {
  editor: Editor;
  itemId: string | undefined;
  onDone: () => void;
}) {
  const [currentId] = useState(() => commentAt(editor.state)?.id ?? null);
  // The thread follows each reply, edit and Undo while the panel is open.
  const thread = useEditorState({
    editor,
    selector: ({ editor: e }) => commentsOf(e.state).find((c) => c.id === currentId) ?? null,
  });
  if (currentId !== null) {
    if (!thread) return <p className="max-w-64 text-sm">This comment is not in the text now.</p>;
    return (
      <div className="w-[min(20rem,calc(100vw-3rem))]">
        <ThreadCard
          editor={editor}
          thread={thread}
          open
          quote
          link={itemId ? commentLink(itemId, thread.id) : null}
          onDone={onDone}
        />
      </div>
    );
  }
  if (editor.state.selection.empty)
    return <p className="max-w-64 text-sm">Select the words for the comment first.</p>;
  return <NewComment editor={editor} onDone={onDone} />;
}

function NewComment({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const id = useId();
  return (
    <form
      className="grid w-[min(20rem,calc(100vw-3rem))] gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() === '') {
          setError('Type the comment first.');
          return;
        }
        if (!editor.commands.addComment(value)) {
          setError('Some of these words have a comment. Select other words, or open that comment.');
          return;
        }
        onDone();
      }}
    >
      <h2 className="text-sm font-medium">Add a comment</h2>
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Comment</Label>
        <Textarea
          id={id}
          rows={3}
          value={value}
          aria-invalid={error !== '' || undefined}
          aria-describedby={`${id}-help`}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
        />
        <p id={`${id}-help`} className={error ? 'text-xs text-accent-text' : 'text-xs text-muted'}>
          {error || 'Only you see comments. Exports and shares leave them out.'}
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

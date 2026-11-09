import type { Editor } from '@tiptap/core';
import { useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import { commentAt } from '../../extensions/comment';

/** Adds a comment to the selected words, or changes or deletes the comment at the cursor (F43). */
export function CommentPanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [current] = useState(() => commentAt(editor.state));
  const [value, setValue] = useState(current?.text ?? '');
  const [error, setError] = useState('');
  const id = useId();

  if (!current && editor.state.selection.empty)
    return <p className="max-w-64 text-sm">Select the words for the comment first.</p>;

  const remove = () => {
    if (current) editor.commands.removeComment(current.id);
    onDone();
  };

  return (
    <form
      className="grid w-[min(20rem,calc(100vw-3rem))] gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() === '') {
          if (current) remove();
          else setError('Type the comment first.');
          return;
        }
        const saved = current
          ? editor.commands.setCommentText(current.id, value)
          : editor.commands.addComment(value);
        if (!saved) {
          setError('Some of these words have a comment. Select other words, or open that comment.');
          return;
        }
        onDone();
      }}
    >
      <h2 className="text-sm font-medium">{current ? 'Comment' : 'Add a comment'}</h2>
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Comment</Label>
        <Textarea
          id={id}
          rows={3}
          value={value}
          aria-invalid={error !== '' || undefined}
          aria-describedby={`${id}-help`}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
        />
        <p id={`${id}-help`} className={error ? 'text-xs text-accent-text' : 'text-xs text-muted'}>
          {error || 'Only you see comments. Exports and shares leave them out.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {current && (
          <Button type="button" variant="ghost" onClick={remove}>
            Delete comment
          </Button>
        )}
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

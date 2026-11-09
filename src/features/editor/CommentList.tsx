import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useId } from 'react';
import { Button } from '@/ui/button';
import { focusText, openPanel } from './commands/editorBus';
import { commentsOf, selectComment } from './extensions/comment';

/** The longest quote of a comment's words in the list. */
const QUOTE_CHARS = 60;

function shortQuote(quote: string): string {
  const clean = quote.replace(/\s+/g, ' ').trim();
  return clean.length > QUOTE_CHARS ? `${clean.slice(0, QUOTE_CHARS - 1).trimEnd()}…` : clean;
}

/**
 * The comments of the open item, in text order, under the text (F43). Pressing a comment selects its words
 * and opens it for editing. Resolve takes the comment off its words. The list re-renders only when a
 * comment changes.
 */
export function CommentList({ editor }: { editor: Editor }) {
  const headingId = useId();
  const comments = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      commentsOf(e.state).map(({ id, text, quote, by }) => ({ id, text, quote, by })),
  });
  if (comments.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="border-t border-rule pt-4" data-vlo-comments="">
      <h2 id={headingId} className="mb-2 text-sm font-medium text-muted">
        Comments
      </h2>
      <ul className="grid gap-1">
        {comments.map((comment) => (
          <li key={comment.id} className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => {
                if (selectComment(editor, comment.id))
                  openPanel({ editor, panel: 'comment', anchor: 'caret' });
              }}
              className="min-h-11 flex-1 rounded-md px-2 py-1 text-left text-sm hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="block text-muted">
                “{shortQuote(comment.quote)}”{comment.by ? `, ${comment.by}` : ''}
              </span>
              <span className="block [overflow-wrap:anywhere] whitespace-pre-wrap">{comment.text}</span>
            </button>
            <Button
              variant="ghost"
              className="shrink-0"
              aria-label={`Resolve the comment on “${shortQuote(comment.quote)}”`}
              onClick={() => {
                editor.commands.removeComment(comment.id);
                focusText(editor);
              }}
            >
              Resolve
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { Editor } from '@tiptap/core';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { CopyButton } from '@/ui/copy-button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { Textarea } from '@/ui/textarea';
import { ICON_BUTTON } from '@/ui/tip';
import { focusText } from './commands/editorBus';
import type { CommentEntry } from './extensions/comment';

/*
 * One comment thread (Phase 19, Task C1): the first comment and its replies, a reply field, Resolve or
 * Reopen, and Copy link. The margin, the Comment panel and the All comments list show the same card.
 * Each change is one step of Undo in the text. Viewing mode shows the thread with no tools.
 */

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
/** The longest quote of the thread's words on the card. */
const QUOTE_CHARS = 60;
/** The size of Resolve and Copy link, the thread's actions. */
const ACTION = 'min-h-9 px-3 pointer-coarse:min-h-11';

export function shortQuote(quote: string): string {
  const clean = quote.replace(/\s+/g, ' ').trim();
  return clean.length > QUOTE_CHARS ? `${clean.slice(0, QUOTE_CHARS - 1).trimEnd()}…` : clean;
}

/** Mod-Enter sends the field's form, as in Google Docs. */
function sendOnModEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

interface Message {
  /** The reply's id, or undefined for the first comment. */
  replyId: string | undefined;
  text: string;
  by: string;
  at: number;
}

interface ThreadCardProps {
  editor: Editor;
  thread: CommentEntry;
  /** Shows the replies in full, the reply field and the tools. A closed card shows the first comment. */
  open: boolean;
  /** The address of the thread for Copy link, or null for no link. */
  link: string | null;
  /** Shows the words of the thread above the comment. */
  quote?: boolean;
  replyField?: Ref<HTMLTextAreaElement> | undefined;
  /** After Resolve, Reopen or Delete, so a list can move on. */
  onDone?: () => void;
}

export function ThreadCard({
  editor,
  thread,
  open,
  link,
  quote = false,
  replyField,
  onDone,
}: ThreadCardProps) {
  const ids = useId();
  const [reply, setReply] = useState('');
  const [editing, setEditing] = useState<{ replyId: string | undefined; text: string } | null>(null);
  const editField = useRef<HTMLTextAreaElement>(null);
  // A deleted thread takes its menu button with it, so the focus goes back to the text.
  const deleted = useRef(false);
  const editKey = editing === null ? null : (editing.replyId ?? thread.id);
  useEffect(() => {
    if (editKey !== null) editField.current?.focus();
  }, [editKey]);
  const editable = editor.isEditable;
  const resolved = thread.resolvedAt > 0;
  const messages: Message[] = [
    { replyId: undefined, text: thread.text, by: thread.by, at: thread.at },
    ...thread.replies.map((r) => ({ replyId: r.id, text: r.text, by: r.by, at: r.at })),
  ];
  const shown = open ? messages : messages.slice(0, 1);
  const words = shortQuote(thread.quote);
  const done = () => {
    focusText(editor);
    onDone?.();
  };

  return (
    <article
      aria-label={`Comment on “${words}”`}
      className={cn('grid gap-2 text-sm', resolved && 'text-muted')}
      data-comment-card={thread.id}
    >
      {quote && <p className="text-xs text-muted [overflow-wrap:anywhere]">“{words}”</p>}
      <ol className="grid gap-2">
        {shown.map((message) => {
          const key = message.replyId ?? thread.id;
          const isEditing = editing !== null && editing.replyId === message.replyId;
          return (
            <li key={key} className="grid gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-xs">
                  <span className="font-medium text-text">{message.by || 'You'}</span>
                  <span className="text-muted">
                    {' · '}
                    <time dateTime={new Date(message.at).toISOString()}>{when.format(message.at)}</time>
                  </span>
                </p>
                {open && editable && !isEditing && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(ICON_BUTTON, '-my-1 shrink-0')}
                        aria-label={`More for the ${message.replyId ? 'reply' : 'comment'} of ${message.by || 'you'}`}
                      >
                        <MoreHorizontal aria-hidden="true" className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={(event) => {
                        if (!deleted.current) return;
                        event.preventDefault();
                        focusText(editor);
                      }}
                    >
                      {message.by === '' && (
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing({ replyId: message.replyId, text: message.text });
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => {
                          if (message.replyId) editor.commands.removeReply(thread.id, message.replyId);
                          else {
                            deleted.current = true;
                            editor.commands.removeComment(thread.id);
                            onDone?.();
                          }
                        }}
                      >
                        {message.replyId ? 'Delete reply' : 'Delete thread'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {isEditing ? (
                <form
                  className="grid gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (editor.commands.setCommentText(thread.id, editing.text, message.replyId))
                      setEditing(null);
                  }}
                >
                  <Textarea
                    aria-label="Edit the comment"
                    rows={2}
                    className="min-h-16 text-sm"
                    ref={editField}
                    value={editing.text}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.stopPropagation();
                        setEditing(null);
                      } else sendOnModEnter(event);
                    }}
                    onChange={(event) => {
                      setEditing({ ...editing, text: event.target.value });
                    }}
                  />
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-2"
                      onClick={() => {
                        setEditing(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="px-3" disabled={editing.text.trim() === ''}>
                      Save
                    </Button>
                  </div>
                </form>
              ) : (
                <p className={cn('[overflow-wrap:anywhere] whitespace-pre-wrap', !open && 'line-clamp-3')}>
                  {message.text}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {!open && thread.replies.length > 0 && (
        <p className="text-xs text-muted">
          {thread.replies.length === 1 ? '1 reply' : `${String(thread.replies.length)} replies`}
        </p>
      )}
      {open && editable && !resolved && (
        <form
          className="grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (editor.commands.replyToComment(thread.id, reply)) setReply('');
          }}
        >
          <label htmlFor={`${ids}-reply`} className="sr-only">
            Reply
          </label>
          <Textarea
            ref={replyField}
            id={`${ids}-reply`}
            rows={1}
            placeholder="Reply"
            className="min-h-11 text-sm"
            value={reply}
            onKeyDown={sendOnModEnter}
            onChange={(event) => {
              setReply(event.target.value);
            }}
          />
          {reply.trim() !== '' && (
            <div className="flex justify-end">
              <Button type="submit" className="px-3">
                Reply
              </Button>
            </div>
          )}
        </form>
      )}
      {open && editable && (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            className={ACTION}
            onClick={() => {
              if (resolved) editor.commands.reopenComment(thread.id);
              else editor.commands.resolveComment(thread.id);
              done();
            }}
          >
            {resolved ? 'Reopen' : 'Resolve'}
          </Button>
          {link !== null && (
            <CopyButton label={`Copy a link to the comment on “${words}”`} text={link} className={ACTION} />
          )}
        </div>
      )}
    </article>
  );
}

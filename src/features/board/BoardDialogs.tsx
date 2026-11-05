import { ArrowDown, ArrowUp } from 'lucide-react';
import { useId, useState } from 'react';
import type { Card, CardLink, Item, Thread } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import {
  addCard,
  addThread,
  BOARD_COLORS,
  cardBackground,
  deleteThread,
  linkCards,
  moveThread,
  threadStroke,
  unlinkCards,
  updateCard,
  updateThread,
} from './board';

/* The Story Board's forms: a card, the links of a card, and the threads (spec 8.1, plan Task C2). */

const SAVE_FAILED = 'Vlo could not save this change on this device. Check the storage space and try again.';

function ColorPicker({
  value,
  onChange,
  legend,
}: {
  value: string;
  onChange: (id: string) => void;
  legend: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {BOARD_COLORS.map((color) => (
          <label
            key={color.id}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-rule px-3 text-sm has-[:checked]:border-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name={legend}
              value={color.id}
              checked={value === color.id}
              onChange={() => {
                onChange(color.id);
              }}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className="size-4 rounded-full border border-rule"
              style={{ background: cardBackground(color.id) }}
            />
            {color.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type CardFormTarget = { type: 'add'; at: { x: number; y: number } } | { type: 'edit'; card: Card };

/** Add or edit a card: title, note, color and the binder item it stands for. */
export function CardDialog({
  target,
  projectId,
  items,
  onClose,
  onSaved,
}: {
  target: CardFormTarget | null;
  projectId: string;
  /** The items a card can stand for: scenes and notes, in binder order. */
  items: readonly Item[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {target && (
        <DialogContent>
          <CardForm
            key={target.type === 'edit' ? target.card.id : 'add'}
            target={target}
            projectId={projectId}
            items={items}
            onDone={(message) => {
              onClose();
              onSaved(message);
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function CardForm({
  target,
  projectId,
  items,
  onDone,
}: {
  target: CardFormTarget;
  projectId: string;
  items: readonly Item[];
  onDone: (message: string) => void;
}) {
  const card = target.type === 'edit' ? target.card : null;
  const [title, setTitle] = useState(card?.title ?? '');
  const [note, setNote] = useState(card?.note ?? '');
  const [color, setColor] = useState(card?.color ?? 'paper');
  const [itemId, setItemId] = useState(card?.itemId ?? '');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const noteId = useId();
  const itemFieldId = useId();
  const errorId = useId();

  async function submit() {
    if (title.trim() === '') {
      setError('A card needs a title.');
      return;
    }
    try {
      if (card) {
        await updateCard(card.id, { title, note, color, itemId: itemId === '' ? null : itemId });
        onDone(`Saved ${title.trim()}.`);
      } else if (target.type === 'add') {
        await addCard(projectId, {
          title,
          note,
          color,
          x: target.at.x,
          y: target.at.y,
          ...(itemId === '' ? {} : { itemId }),
        });
        onDone(`Added ${title.trim()}.`);
      }
    } catch {
      setError(SAVE_FAILED);
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogTitle>{card ? `Edit ${card.title}` : 'Add a card'}</DialogTitle>
      <DialogDescription>
        A card holds one moment of the story. Link it to a scene to open that scene from the board.
      </DialogDescription>
      <div className="grid gap-2">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          value={title}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={noteId}>Note</Label>
        <Textarea
          id={noteId}
          rows={3}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={itemFieldId}>Scene</Label>
        <select
          id={itemFieldId}
          value={itemId}
          onChange={(event) => {
            setItemId(event.target.value);
          }}
          className="min-h-11 rounded-md border border-rule bg-surface px-3 text-sm"
        >
          <option value="">No scene</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </div>
      <ColorPicker legend="Card color" value={color} onChange={setColor} />
      {error !== null && (
        <p id={errorId} role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">{card ? 'Save card' : 'Add card'}</Button>
      </div>
    </form>
  );
}

/** The links of one card: link it to another card on a thread, or remove a link. */
export function LinkDialog({
  card,
  cards,
  threads,
  links,
  onClose,
  onSaved,
}: {
  card: Card | null;
  cards: readonly Card[];
  threads: readonly Thread[];
  links: readonly CardLink[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Dialog
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {card && (
        <DialogContent>
          <LinkForm
            key={card.id}
            card={card}
            cards={cards}
            threads={threads}
            links={links}
            onSaved={onSaved}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function LinkForm({
  card,
  cards,
  threads,
  links,
  onSaved,
}: {
  card: Card;
  cards: readonly Card[];
  threads: readonly Thread[];
  links: readonly CardLink[];
  onSaved: (message: string) => void;
}) {
  const others = cards.filter((c) => c.id !== card.id);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [threadId, setThreadId] = useState(threads[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const toId = useId();
  const threadFieldId = useId();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const threadById = new Map(threads.map((t) => [t.id, t]));
  const mine = links.filter((l) => l.fromCardId === card.id || l.toCardId === card.id);

  async function link() {
    const other = byId.get(to);
    if (!other) return;
    try {
      await linkCards(card.projectId, card.id, other.id, threadId === '' ? undefined : threadId);
      const thread = threadById.get(threadId);
      onSaved(`Linked ${card.title} to ${other.title}${thread ? ` on ${thread.name}` : ''}.`);
      setError(null);
    } catch {
      setError(SAVE_FAILED);
    }
  }

  return (
    <div className="grid gap-4">
      <DialogTitle>Links of {card.title}</DialogTitle>
      <DialogDescription>
        A link joins two cards. A link on a thread takes the thread’s color.
      </DialogDescription>
      {mine.length > 0 && (
        <ul aria-label={`Links of ${card.title}`} className="grid gap-2">
          {mine.map((link) => {
            const other = byId.get(link.fromCardId === card.id ? link.toCardId : link.fromCardId);
            const thread = link.threadId ? threadById.get(link.threadId) : undefined;
            const label = `${other?.title ?? 'A card'}${thread ? `, on ${thread.name}` : ', no thread'}`;
            return (
              <li
                key={link.id}
                className="flex items-center justify-between gap-2 rounded-md border border-rule px-3 py-1"
              >
                <span className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-0.5 w-5 rounded-full"
                    style={{ background: threadStroke(thread?.color ?? 'paper') }}
                  />
                  {label}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove the link to ${label}`}
                  onClick={() => {
                    void unlinkCards(link.id).then(() => {
                      onSaved(`Removed the link to ${other?.title ?? 'a card'}.`);
                    });
                  }}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {others.length === 0 ? (
        <p className="text-sm text-muted">Add another card to link this one to it.</p>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void link();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={toId}>Link to</Label>
            <select
              id={toId}
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
              }}
              className="min-h-11 rounded-md border border-rule bg-surface px-3 text-sm"
            >
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={threadFieldId}>Thread</Label>
            <select
              id={threadFieldId}
              value={threadId}
              onChange={(event) => {
                setThreadId(event.target.value);
              }}
              className="min-h-11 rounded-md border border-rule bg-surface px-3 text-sm"
            >
              <option value="">No thread</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {error !== null && (
            <p role="alert" className="text-sm text-accent-text">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Done
              </Button>
            </DialogClose>
            <Button type="submit">Link cards</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Add, rename, recolor and delete threads. */
export function ThreadsDialog({
  open,
  projectId,
  threads,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  threads: readonly Thread[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('rose');
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();

  async function add() {
    if (name.trim() === '') {
      setError('A thread needs a name.');
      return;
    }
    try {
      await addThread(projectId, name, color);
      onSaved(`Added the thread ${name.trim()}.`);
      setName('');
      setError(null);
    } catch {
      setError(SAVE_FAILED);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <div className="grid gap-4">
          <DialogTitle>Threads</DialogTitle>
          <DialogDescription>
            A thread is one line of the plot, such as a debt or a secret. Links on a thread take its color,
            and the Plot Grid has a column for each thread, in this order.
          </DialogDescription>
          {threads.length > 0 && (
            <ul aria-label="Threads" className="grid gap-3">
              {threads.map((thread, index) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  first={index === 0}
                  last={index === threads.length - 1}
                  onSaved={onSaved}
                />
              ))}
            </ul>
          )}
          <form
            className="grid gap-3 border-t border-rule pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={nameId}>New thread</Label>
              <Input
                id={nameId}
                value={name}
                aria-invalid={error !== null}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
              />
            </div>
            <ColorPicker legend="New thread color" value={color} onChange={setColor} />
            {error !== null && (
              <p role="alert" className="text-sm text-accent-text">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Done
                </Button>
              </DialogClose>
              <Button type="submit">Add thread</Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThreadRow({
  thread,
  first,
  last,
  onSaved,
}: {
  thread: Thread;
  first: boolean;
  last: boolean;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(thread.name);
  const fieldId = useId();
  const save = () => {
    if (name.trim() === '' || name.trim() === thread.name) {
      setName(thread.name);
      return;
    }
    void updateThread(thread.id, { name }).then(() => {
      onSaved(`Renamed the thread to ${name.trim()}.`);
    });
  };
  return (
    <li className="grid gap-2 rounded-md border border-rule p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <Label htmlFor={fieldId}>
            Name<span className="sr-only"> of {thread.name}</span>
          </Label>
          <Input
            id={fieldId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                save();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          className="min-w-11 px-0"
          aria-label={`Move ${thread.name} up`}
          disabled={first}
          onClick={() => {
            void moveThread(thread.id, -1).then(() => {
              onSaved(`Moved ${thread.name} up.`);
            });
          }}
        >
          <ArrowUp aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-w-11 px-0"
          aria-label={`Move ${thread.name} down`}
          disabled={last}
          onClick={() => {
            void moveThread(thread.id, 1).then(() => {
              onSaved(`Moved ${thread.name} down.`);
            });
          }}
        >
          <ArrowDown aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Delete the thread ${thread.name}`}
          onClick={() => {
            void deleteThread(thread.id).then(() => {
              onSaved(`Deleted the thread ${thread.name}. Its links stay as plain links.`);
            });
          }}
        >
          Delete
        </Button>
      </div>
      <ColorPicker
        legend={`Color of ${thread.name}`}
        value={thread.color}
        onChange={(color) => {
          void updateThread(thread.id, { color });
        }}
      />
    </li>
  );
}

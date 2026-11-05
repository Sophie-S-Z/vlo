import { Fragment, useId, useState } from 'react';
import { moveItem } from '@/features/binder/items';
import type { Card, CardLink, Item, Thread } from '@/lib/db';
import { orderAfterLast } from '@/lib/order';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Label } from '@/ui/label';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import { cardBackground, moveCardToThread, threadStroke } from './board';
import { CardMenu, type CardActions } from './CardMenu';
import { NONE, plotGrid } from './plotGrid';
import { cardTransitionName } from './useBoard';

/*
 * The Plot Grid view (spec 8.1, plan Task C3). Each card keeps its view transition name, so a switch
 * from the board moves each card to its cell. A card on two threads takes the name in its first column.
 */

export function PlotGridView({
  items,
  cards,
  threads,
  links,
  actions,
  announce,
}: {
  items: readonly Item[];
  cards: readonly Card[];
  threads: readonly Thread[];
  links: readonly CardLink[];
  actions: CardActions;
  announce: (message: string) => void;
}) {
  const grid = plotGrid(items, cards, links, threads);
  const [moving, setMoving] = useState<Card | null>(null);
  const [threadMove, setThreadMove] = useState<{ card: Card; from: string | null } | null>(null);
  const named = new Set<string>();
  // Each column gives its cards a thread move from that column's thread.
  const actionsFor = (columnId: string): CardActions => ({
    ...actions,
    moveToChapter: setMoving,
    ...(threads.length > 0
      ? {
          moveToThread: (card: Card) => {
            setThreadMove({ card, from: columnId === NONE ? null : columnId });
          },
        }
      : {}),
  });

  if (cards.length === 0)
    return (
      <p className="rounded-[var(--radius-card)] border border-rule p-6 text-muted">
        The board is empty. Add a card, or make one card for each scene with Cards from scenes.
      </p>
    );

  return (
    <>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-rule">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Plot Grid: chapters by threads</caption>
          <thead>
            <tr className="border-b border-rule">
              <td className="w-40 min-w-32 p-3" />
              {grid.columns.map((column) => (
                <th key={column.id} scope="col" className="min-w-52 p-3 font-medium">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-1 w-5 rounded-full"
                      style={{
                        background: column.color === null ? 'var(--rule)' : threadStroke(column.color),
                      }}
                    />
                    {column.title}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.id} className="border-b border-rule align-top last:border-b-0">
                <th scope="row" className="p-3 font-display text-base font-semibold">
                  {row.title}
                </th>
                {grid.columns.map((column) => (
                  <td key={column.id} className="p-2">
                    <ul className="grid gap-2" aria-label={`${row.title}, ${column.title}`}>
                      {(grid.cells.get(row.id)?.get(column.id) ?? []).map((card) => {
                        const first = !named.has(card.id);
                        named.add(card.id);
                        const body = (
                          <li
                            className="flex items-start gap-1 rounded-[var(--radius-card)] border border-rule p-2 pl-3"
                            style={{ background: cardBackground(card.color) }}
                          >
                            {card.itemId !== undefined ? (
                              <button
                                type="button"
                                className="min-h-11 min-w-0 flex-1 text-left font-medium [overflow-wrap:anywhere] hover:underline"
                                onClick={() => {
                                  actions.open(card);
                                }}
                              >
                                {card.title}
                              </button>
                            ) : (
                              <span className="flex min-h-11 min-w-0 flex-1 items-center font-medium [overflow-wrap:anywhere]">
                                {card.title}
                              </span>
                            )}
                            <CardMenu card={card} actions={actionsFor(column.id)} />
                          </li>
                        );
                        return first ? (
                          <MotionViewTransition
                            key={card.id}
                            name={cardTransitionName(card.id)}
                            update="none"
                          >
                            {body}
                          </MotionViewTransition>
                        ) : (
                          // A second copy on another thread has no transition name, so names stay unique.
                          <Fragment key={card.id}>{body}</Fragment>
                        );
                      })}
                    </ul>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ThreadMoveDialog
        move={threadMove}
        cards={cards}
        threads={threads}
        links={links}
        onClose={() => {
          setThreadMove(null);
        }}
        announce={announce}
      />
      <MoveDialog
        card={moving}
        items={items}
        onClose={() => {
          setMoving(null);
        }}
        announce={announce}
      />
    </>
  );
}

/** Moves a card's scene to the end of another chapter, after the writer picks it. */
function MoveDialog({
  card,
  items,
  onClose,
  announce,
}: {
  card: Card | null;
  items: readonly Item[];
  onClose: () => void;
  announce: (message: string) => void;
}) {
  const chapters = items.filter((i) => i.kind === 'chapter');
  const scene = card?.itemId === undefined ? undefined : items.find((i) => i.id === card.itemId);
  const [target, setTarget] = useState('');
  const fieldId = useId();
  const choice = target === '' ? (chapters.find((c) => c.id !== scene?.parentId)?.id ?? '') : target;

  async function move() {
    const chapter = chapters.find((c) => c.id === choice);
    if (!scene || !chapter) return;
    const siblings = items.filter((i) => i.parentId === chapter.id).map((i) => i.order);
    try {
      await moveItem(scene.id, chapter.id, orderAfterLast(siblings));
      announce(`Moved ${scene.title} to ${chapter.title}.`);
    } catch {
      announce('Vlo could not save the move on this device.');
    }
    onClose();
  }

  return (
    <Dialog
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) {
          setTarget('');
          onClose();
        }
      }}
    >
      {card && scene && (
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void move();
            }}
          >
            <DialogTitle>Move {scene.title}</DialogTitle>
            <DialogDescription>
              The scene moves to the end of the chapter you pick. The binder shows the new place.
            </DialogDescription>
            <div className="grid gap-2">
              <Label htmlFor={fieldId}>Chapter</Label>
              <select
                id={fieldId}
                value={choice}
                onChange={(event) => {
                  setTarget(event.target.value);
                }}
                className="min-h-11 rounded-md border border-rule bg-surface px-3 text-sm"
              >
                {chapters.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === scene.parentId}>
                    {c.title}
                    {c.id === scene.parentId ? ' (now)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={choice === ''}>
                Move scene
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

/**
 * Moves a card from the thread of its column to another thread. Its links on the old thread move with it.
 * A card in "No thread" with no link at all needs a card on the new thread to link to.
 */
function ThreadMoveDialog({
  move,
  cards,
  threads,
  links,
  onClose,
  announce,
}: {
  move: { card: Card; from: string | null } | null;
  cards: readonly Card[];
  threads: readonly Thread[];
  links: readonly CardLink[];
  onClose: () => void;
  announce: (message: string) => void;
}) {
  return (
    <Dialog
      open={move !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {move && (
        <DialogContent>
          <ThreadMoveForm
            key={`${move.card.id}-${move.from ?? NONE}`}
            move={move}
            cards={cards}
            threads={threads}
            links={links}
            onDone={(message) => {
              onClose();
              announce(message);
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function ThreadMoveForm({
  move,
  cards,
  threads,
  links,
  onDone,
}: {
  move: { card: Card; from: string | null };
  cards: readonly Card[];
  threads: readonly Thread[];
  links: readonly CardLink[];
  onDone: (message: string) => void;
}) {
  const { card, from } = move;
  const targets = threads.filter((t) => t.id !== from);
  const [to, setTo] = useState(targets[0]?.id ?? '');
  const threadFieldId = useId();
  const linkFieldId = useId();
  const [error, setError] = useState<string | null>(null);

  const mine = links.filter((l) => l.fromCardId === card.id || l.toCardId === card.id);
  const carried = mine.filter((l) => (from === null ? l.threadId === undefined : l.threadId === from));
  // With no link to carry, the card needs a partner on the new thread. Cards already on it come first.
  const onTarget = new Set(
    links
      .filter((l) => l.threadId === to)
      .flatMap((l) => [l.fromCardId, l.toCardId])
      .filter((id) => id !== card.id),
  );
  const partners = [
    ...cards.filter((c) => onTarget.has(c.id)),
    ...cards.filter((c) => c.id !== card.id && !onTarget.has(c.id)),
  ];
  const [linkTo, setLinkTo] = useState('');
  const partner = linkTo === '' ? (partners[0]?.id ?? '') : linkTo;
  const titleOf = new Map(cards.map((c) => [c.id, c.title]));
  const companions = carried
    .map((l) => titleOf.get(l.fromCardId === card.id ? l.toCardId : l.fromCardId) ?? 'a card')
    .join(', ');
  const fromName = from === null ? 'No thread' : (threads.find((t) => t.id === from)?.name ?? 'its thread');

  async function save() {
    const thread = threads.find((t) => t.id === to);
    if (!thread) return;
    try {
      await moveCardToThread(card.id, from, thread.id, carried.length === 0 ? partner : undefined);
      onDone(`Moved ${card.title} to ${thread.name}.`);
    } catch {
      setError('Vlo could not save the move on this device. Check the storage space and try again.');
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <DialogTitle>Move {card.title} to another thread</DialogTitle>
      <DialogDescription>
        {carried.length > 0
          ? `The card leaves ${fromName}. A card is on a thread through its links, so its links there move to the thread you pick, with the cards at their other ends: ${companions}.`
          : 'A card is on a thread through a link. Pick a card to link it to on the new thread.'}
      </DialogDescription>
      <div className="grid gap-2">
        <Label htmlFor={threadFieldId}>Thread</Label>
        <select
          id={threadFieldId}
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            setLinkTo('');
          }}
          className="min-h-11 rounded-md border border-rule bg-surface px-3 text-sm"
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {carried.length === 0 && (
        <div className="grid gap-2">
          <Label htmlFor={linkFieldId}>Link to</Label>
          <select
            id={linkFieldId}
            value={partner}
            onChange={(event) => {
              setLinkTo(event.target.value);
            }}
            className="min-h-11 rounded-md border border-rule bg-surface px-3 text-sm"
          >
            {partners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={to === '' || (carried.length === 0 && partner === '')}>
          Move card
        </Button>
      </div>
    </form>
  );
}

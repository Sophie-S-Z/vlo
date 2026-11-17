import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { MessageSquareText } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { commentLink, focusText, openPanel } from './commands/editorBus';
import { commentAt, commentsOf, selectComment, setCardFocus, type CommentEntry } from './extensions/comment';
import { changesOf, type ChangeEntry } from './extensions/suggestion';
import { shortQuote, ThreadCard } from './ThreadCard';

/*
 * The review margin (Phase 19, Tasks C1 and C2). With room right of the page, each open comment thread and
 * each waiting change is a card beside its words. Cards that would overlap stack down, and the card at the
 * caret moves to its words. Without room, a small count in the margin of each line with comments opens the
 * thread in the Comment panel. The cards move only after a pause in typing, so typing stays fast.
 */

/** The space between two cards, in pixels. */
const GAP = 8;
/** The cards move to their words after this pause in typing. */
const PAUSE_MS = 300;
/** The room right of the page that a count needs, in pixels: its 24 px and a gap. */
const COUNT_ROOM = 28;

type Card = { kind: 'comment'; entry: CommentEntry } | { kind: 'change'; entry: ChangeEntry };

const cardId = (card: Card) => `${card.kind}:${card.entry.id}`;

/** The open threads and the waiting changes, in text order. */
function cardsOf(editor: Editor): Card[] {
  const cards: Card[] = [
    ...commentsOf(editor.state)
      .filter((c) => c.resolvedAt === 0)
      .map((entry): Card => ({ kind: 'comment', entry })),
    ...changesOf(editor.state).map((entry): Card => ({ kind: 'change', entry })),
  ];
  return cards.sort((a, b) => a.entry.from - b.entry.from);
}

/** The card at the caret: its comment, or else its change. */
function activeOf(editor: Editor, cards: readonly Card[]): string | null {
  const comment = commentAt(editor.state);
  if (comment?.resolvedAt === 0) return `comment:${comment.id}`;
  const { from, to } = editor.state.selection;
  const change = cards.find((c) => c.kind === 'change' && c.entry.from <= from && to <= c.entry.to);
  return change ? cardId(change) : null;
}

/** The top of the line of a place in the text, from the top of `box`. */
function lineTop(editor: Editor, pos: number, box: DOMRect): number {
  try {
    return editor.view.coordsAtPos(Math.min(pos + 1, editor.state.doc.content.size)).top - box.top;
  } catch {
    return 0;
  }
}

/** Places the cards: the active card at its words, the others as near their words as they fit. */
function stack(wanted: readonly number[], heights: readonly number[], active: number): number[] {
  const tops = [...wanted];
  const down = (from: number) => {
    for (let i = from; i < tops.length; i++)
      tops[i] = Math.max(wanted[i] ?? 0, (tops[i - 1] ?? -Infinity) + (heights[i - 1] ?? 0) + GAP);
  };
  if (active < 0) {
    down(1);
    return tops;
  }
  for (let i = active - 1; i >= 0; i--)
    tops[i] = Math.min(wanted[i] ?? 0, (tops[i + 1] ?? 0) - (heights[i] ?? 0) - GAP);
  down(active + 1);
  // No card goes above the page. The active card moves down when the cards above need the room.
  if ((tops[0] ?? 0) < 0) {
    tops[0] = Math.max(0, wanted[0] ?? 0);
    down(1);
  }
  return tops;
}

interface ReviewMarginProps {
  editor: Editor;
  itemId: string;
  /** True when the page has room for cards at its right. */
  room: boolean;
}

export function ReviewMargin({ editor, itemId, room }: ReviewMarginProps) {
  const box = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLElement>());
  const replyField = useRef<HTMLTextAreaElement>(null);
  const [cards, setCards] = useState<Card[]>(() => cardsOf(editor));
  const [active, setActive] = useState<string | null>(() => activeOf(editor, cardsOf(editor)));
  const [tops, setTops] = useState<ReadonlyMap<string, { card: number; words: number }>>(new Map());
  const [hover, setHover] = useState<string | null>(null);
  // With no room right of the page, as on a phone, the counts sit at the right end of the lines.
  const [inside, setInside] = useState(false);

  // The cards change after a pause in typing, and the active card at once.
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      const next = cardsOf(editor);
      setCards(next);
      setActive(activeOf(editor, next));
    };
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(update, PAUSE_MS);
    };
    const onSelection = () => {
      setActive(activeOf(editor, cardsOf(editor)));
    };
    editor.on('transaction', onTransaction);
    editor.on('selectionUpdate', onSelection);
    return () => {
      window.clearTimeout(timer);
      editor.off('transaction', onTransaction);
      editor.off('selectionUpdate', onSelection);
    };
  }, [editor]);

  const layout = useCallback(() => {
    const el = box.current;
    if (!el || editor.isDestroyed) return;
    const rect = el.getBoundingClientRect();
    const words = cards.map((card) => lineTop(editor, card.entry.from, rect));
    if (!room) {
      const page = el.parentElement?.getBoundingClientRect().right ?? rect.right;
      setInside(document.documentElement.clientWidth - page < COUNT_ROOM);
      setTops(new Map(cards.map((card, i) => [cardId(card), { card: words[i] ?? 0, words: words[i] ?? 0 }])));
      return;
    }
    const heights = cards.map((card) => cardEls.current.get(cardId(card))?.offsetHeight ?? 0);
    const placed = stack(
      words,
      heights,
      cards.findIndex((card) => cardId(card) === active),
    );
    setTops(new Map(cards.map((card, i) => [cardId(card), { card: placed[i] ?? 0, words: words[i] ?? 0 }])));
  }, [editor, cards, active, room]);

  useLayoutEffect(layout, [layout]);

  // A card that grows, a page that changes width, or new fonts move the cards again.
  useEffect(() => {
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => {
      layout();
    });
    observer.observe(editor.view.dom);
    for (const el of cardEls.current.values()) observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [editor, layout, cards]);

  // The Comment tool on a thread's words goes to its card.
  useEffect(() => {
    if (!room) return;
    setCardFocus(editor, (id) => {
      if (!cardEls.current.has(`comment:${id}`)) return false;
      selectComment(editor, id);
      // The card opens at the next render, with its reply field.
      requestAnimationFrame(() => {
        replyField.current?.focus();
      });
      return true;
    });
    return () => {
      setCardFocus(editor, null);
    };
  }, [editor, room]);

  const comments = cards.filter((c): c is Extract<Card, { kind: 'comment' }> => c.kind === 'comment');

  if (!room) {
    // One count for each line with comments.
    const lines = new Map<number, CommentEntry[]>();
    for (const { entry } of comments) {
      const top = tops.get(`comment:${entry.id}`)?.words;
      if (top === undefined) continue;
      lines.set(top, [...(lines.get(top) ?? []), entry]);
    }
    return (
      <div
        ref={box}
        className={cn('absolute top-0 bottom-0 w-6 print:hidden', inside ? 'right-0' : 'left-full ml-1')}
        data-review-margin=""
      >
        {[...lines].map(([top, threads]) => {
          const first = threads[0];
          if (!first) return null;
          return (
            <button
              key={first.id}
              type="button"
              className="absolute left-0 flex size-6 items-center justify-center rounded-md bg-surface text-xs font-medium text-accent-text shadow-sm outline-none hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-accent"
              style={{ top }}
              aria-label={
                threads.length === 1
                  ? `Open the comment on “${shortQuote(first.quote)}”`
                  : `Open the ${String(threads.length)} comments on this line`
              }
              onClick={() => {
                if (!selectComment(editor, first.id)) return;
                focusText(editor);
                openPanel({ editor, panel: 'comment', anchor: 'caret' });
              }}
            >
              {threads.length === 1 ? (
                <MessageSquareText aria-hidden="true" className="size-3.5" />
              ) : (
                threads.length
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const shownLine = hover ?? active;
  const line = shownLine === null ? undefined : tops.get(shownLine);

  return (
    <aside
      ref={box}
      aria-label="Comments and changes"
      className="absolute top-0 bottom-0 left-full ml-8 w-56 print:hidden"
      data-review-margin=""
    >
      {line && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute top-0 -left-8 h-full w-8 overflow-visible"
        >
          <polyline
            points={`0,${String(line.words + 12)} 16,${String(line.words + 12)} 32,${String(line.card + 12)}`}
            className="fill-none stroke-accent"
            strokeWidth={1}
          />
        </svg>
      )}
      {cards.map((card) => {
        const id = cardId(card);
        const isActive = id === active;
        const top = tops.get(id)?.card;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) cardEls.current.set(id, el);
              else cardEls.current.delete(id);
            }}
            className={cn(
              'absolute inset-x-0 rounded-[var(--radius-card)] border bg-bg p-3 motion-safe:transition-transform',
              isActive ? 'z-10 border-accent shadow-md' : 'border-rule',
              top === undefined && 'invisible',
            )}
            style={{ transform: `translateY(${String(top ?? 0)}px)` }}
            onPointerEnter={() => {
              setHover(id);
            }}
            onPointerLeave={() => {
              setHover(null);
            }}
            onFocus={() => {
              setHover(id);
            }}
            onBlur={() => {
              setHover(null);
            }}
          >
            {card.kind === 'comment' ? (
              <ThreadCard
                editor={editor}
                thread={card.entry}
                open={isActive}
                link={commentLink(itemId, card.entry.id)}
                replyField={isActive ? replyField : undefined}
              />
            ) : (
              <ChangeCard editor={editor} change={card.entry} />
            )}
            {!isActive && (
              <button
                type="button"
                className="absolute inset-0 rounded-[var(--radius-card)] outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Go to the ${card.kind === 'comment' ? 'comment' : 'change'} on “${shortQuote(card.kind === 'comment' ? card.entry.quote : card.entry.text)}”`}
                onClick={() => {
                  if (card.kind === 'comment') selectComment(editor, card.entry.id);
                  else selectChange(editor, card.entry);
                  focusText(editor);
                }}
              />
            )}
          </div>
        );
      })}
    </aside>
  );
}

function selectChange(editor: Editor, change: ChangeEntry): void {
  const { doc } = editor.state;
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(doc, change.from, change.to)).scrollIntoView(),
  );
}

/** A waiting change (Task C2): who made it, its pass color, its words, and Accept and Reject. */
function ChangeCard({ editor, change }: { editor: Editor; change: ChangeEntry }) {
  const what = `${change.kind === 'insert' ? 'Inserted' : 'Deleted'}${change.by ? ` by ${change.by}` : ''}`;
  const words = shortQuote(change.text);
  return (
    <article aria-label={`${what}: “${words}”`} className="grid gap-2 text-sm">
      <p className="flex items-center gap-2 text-xs text-muted">
        <span className="vlo-pass-swatch" data-pass={change.pass} aria-hidden="true" />
        {what}, pass {change.pass}
      </p>
      <p className={cn('[overflow-wrap:anywhere]', change.kind === 'delete' && 'line-through')}>“{words}”</p>
      {editor.isEditable && (
        <div className="relative z-10 flex gap-1">
          <Button
            variant="outline"
            className="min-h-9 px-3 pointer-coarse:min-h-11"
            aria-label={`Accept: ${what} “${words}”`}
            onClick={() => {
              editor.commands.acceptChange(change.id);
              focusText(editor);
            }}
          >
            Accept
          </Button>
          <Button
            variant="ghost"
            className="min-h-9 px-3 pointer-coarse:min-h-11"
            aria-label={`Reject: ${what} “${words}”`}
            onClick={() => {
              editor.commands.rejectChange(change.id);
              focusText(editor);
            }}
          >
            Reject
          </Button>
        </div>
      )}
    </article>
  );
}

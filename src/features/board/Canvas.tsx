import { useDrag, useGesture } from '@use-gesture/react';
import { Link2, Maximize, Minus, Plus } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { Card, CardLink, Thread } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import { cardBackground, linkCards, moveCard, nudgeCard, threadStroke } from './board';
import { CardMenu, type CardActions } from './CardMenu';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  centerOn,
  fitAll,
  glideAt,
  glideDone,
  glideEnd,
  GRID,
  snap,
  threadPath,
  zoomAt,
  type Point,
  type Size,
  type View,
} from './geometry';
import { cardTransitionName } from './useBoard';

/*
 * The Story Board canvas (spec 8.1, plan Task C2). Cards are DOM elements on one layer that moves and
 * scales with a CSS transform. Drag the empty board or use two fingers to pan; use the wheel, a pinch or
 * the zoom buttons to zoom. Cards drag with a glide (plan decision D1) and snap to the 8 px grid.
 */

const ZOOM_STEP = 1.25;
/** How long the zoom into a card takes before its scene opens. */
const ZOOM_IN_MS = 280;

interface CanvasProps {
  cards: readonly Card[];
  threads: readonly Thread[];
  links: readonly CardLink[];
  /** The title of each item a card stands for. */
  itemTitles: ReadonlyMap<string, string>;
  view: View | null;
  onView: (view: View) => void;
  actions: CardActions;
  motion: boolean;
  /** Says a change in words, for screen readers. */
  announce: (message: string) => void;
  /** The size of the visible board, so the page can put a new card in the middle of it. */
  onSize: (size: Size) => void;
}

export function Canvas({
  cards,
  threads,
  links,
  itemTitles,
  view,
  onView,
  actions,
  motion,
  announce,
  onSize,
}: CanvasProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  // Positions that differ from the stored ones: during a drag, and during a glide until the store has it.
  const [moving, setMoving] = useState<ReadonlyMap<string, Point>>(new Map());
  const [zooming, setZooming] = useState(false);
  // The touch points on the board now. With two, the gesture is a pinch, and no card moves.
  const touches = useRef(new Set<number>());
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'touch') touches.current.add(event.pointerId);
    };
    const up = (event: PointerEvent) => {
      touches.current.delete(event.pointerId);
    };
    // Capture, so the count is right before any card or gesture sees the event.
    el.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      el.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);
  const pinching = useCallback(() => touches.current.size > 1, []);
  // A link the writer drags out from a card's handle: the card and the end of the line, in board space.
  const [linking, setLinking] = useState<{ from: string; to: Point } | null>(null);
  const helpId = useId();

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize(next);
      onSize(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [onSize]);

  // The first look at a board shows every card.
  useEffect(() => {
    if (view === null && size !== null) onView(fitAll(cards, size));
  }, [view, size, cards, onView]);

  const current = view ?? { x: 0, y: 0, scale: 1 };
  // The view that the gesture handlers see. A handler writes it at once, so two events that arrive
  // before the next render both count.
  const viewRef = useRef(current);
  useLayoutEffect(() => {
    viewRef.current = current;
  });
  const moveView = useCallback(
    (next: View) => {
      viewRef.current = next;
      onView(next);
    },
    [onView],
  );

  // Pan, wheel and pinch on the empty board.
  useGesture(
    {
      onDrag: ({ delta: [dx, dy], event, first, cancel, pinching }) => {
        if (pinching) {
          cancel();
          return;
        }
        if (first && event.target instanceof Element && event.target.closest('[data-board-card]')) {
          cancel();
          return;
        }
        const v = viewRef.current;
        moveView({ ...v, x: v.x + dx, y: v.y + dy });
      },
      onPinch: ({ origin: [ox, oy], offset: [scale] }) => {
        const rect = frame.current?.getBoundingClientRect();
        if (!rect) return;
        const v = viewRef.current;
        moveView(zoomAt(v, scale / v.scale, { x: ox - rect.left, y: oy - rect.top }));
      },
      onWheel: ({ event, delta: [dx, dy] }) => {
        event.preventDefault();
        const v = viewRef.current;
        // A trackpad pinch arrives as a wheel event with the Control key.
        if (event.ctrlKey || event.metaKey) {
          const rect = frame.current?.getBoundingClientRect();
          if (!rect) return;
          moveView(
            zoomAt(v, Math.exp(-dy * 0.01), { x: event.clientX - rect.left, y: event.clientY - rect.top }),
          );
        } else {
          moveView({ ...v, x: v.x - dx, y: v.y - dy });
        }
      },
    },
    {
      target: frame,
      eventOptions: { passive: false },
      drag: { filterTaps: true },
      pinch: { scaleBounds: { min: 0.1, max: 4 }, from: () => [viewRef.current.scale, 0] },
    },
  );

  const zoomBy = (factor: number) => {
    if (!size) return;
    moveView(zoomAt(current, factor, { x: size.width / 2, y: size.height / 2 }));
  };

  const setPosition = useCallback((id: string, at: Point | null) => {
    setMoving((map) => {
      const next = new Map(map);
      if (at === null) next.delete(id);
      else next.set(id, at);
      return next;
    });
  }, []);

  const commit = useCallback(
    async (card: Card, at: Point) => {
      const x = snap(at.x);
      const y = snap(at.y);
      await moveCard(card.id, x, y).catch(() => {
        announce('Vlo could not save the move on this device.');
      });
      setPosition(card.id, null);
    },
    [announce, setPosition],
  );

  const release = useCallback(
    (card: Card, at: Point, velocity: Point) => {
      const end = glideEnd(at, motion ? velocity : { x: 0, y: 0 });
      if (!motion || (end.x === snap(at.x) && end.y === snap(at.y))) {
        void commit(card, end);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const elapsed = now - start;
        if (glideDone(at, end, elapsed)) {
          void commit(card, end);
          return;
        }
        setPosition(card.id, glideAt(at, end, elapsed));
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    [motion, commit, setPosition],
  );

  const keyMove = useCallback(
    (card: Card, dx: number, dy: number) => {
      nudgeCard(card.id, dx, dy).then(
        (at) => {
          if (at) announce(`${card.title} moved to ${String(at.x)}, ${String(at.y)}.`);
        },
        () => {
          announce('Vlo could not save the move on this device.');
        },
      );
    },
    [announce],
  );

  const open = useCallback(
    (card: Card) => {
      if (!card.itemId) {
        actions.edit(card);
        return;
      }
      if (!motion || !size) {
        actions.open(card);
        return;
      }
      // Zoom into the card, then let it grow into its scene.
      setZooming(true);
      moveView(centerOn(card, size, Math.max(1.6, viewRef.current.scale)));
      window.setTimeout(() => {
        actions.open(card);
      }, ZOOM_IN_MS);
    },
    [actions, motion, size, moveView],
  );

  const dragLink = useCallback((from: Card, to: Point | null) => {
    setLinking(to === null ? null : { from: from.id, to });
  }, []);

  const dropLink = useCallback(
    (from: Card, target: Card | undefined) => {
      setLinking(null);
      if (!target || target.id === from.id) return;
      linkCards(from.projectId, from.id, target.id).then(
        () => {
          announce(`Linked ${from.title} to ${target.title}. Pick a thread for it in Links.`);
        },
        () => {
          announce('Vlo could not save the link on this device.');
        },
      );
    },
    [announce],
  );

  const positionOf = (card: Card): Point => moving.get(card.id) ?? card;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const byIdRef = useRef(byId);
  useLayoutEffect(() => {
    byIdRef.current = byId;
  });
  // The card under a point on the screen, for the end of a dragged link.
  const cardAt = useCallback((clientX: number, clientY: number): Card | undefined => {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-board-card]');
    const id = el?.dataset.cardId;
    return id === undefined ? undefined : byIdRef.current.get(id);
  }, []);
  const threadById = new Map(threads.map((t) => [t.id, t]));

  return (
    <div className="relative">
      <p id={helpId} className="sr-only">
        Arrow keys move a card by 8 pixels, Shift and an arrow key by 64. Enter opens the card’s scene, or
        edits a card with no scene. The List view has every card in a table.
      </p>
      <div
        ref={frame}
        data-zooming={zooming || undefined}
        className="relative h-[min(72dvh,48rem)] min-h-80 touch-none overflow-hidden rounded-[var(--radius-card)] border border-rule bg-bg select-none"
        role="region"
        aria-label="Story Board"
      >
        <div
          className={cn(
            'absolute top-0 left-0 origin-top-left',
            zooming && 'transition-transform duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          )}
          style={{
            transform: `translate(${String(current.x)}px, ${String(current.y)}px) scale(${String(current.scale)})`,
          }}
        >
          <svg
            aria-hidden="true"
            data-board-threads=""
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width="1"
            height="1"
          >
            {links.map((link) => {
              const from = byId.get(link.fromCardId);
              const to = byId.get(link.toCardId);
              if (!from || !to) return null;
              const thread = link.threadId ? threadById.get(link.threadId) : undefined;
              return (
                <path
                  key={link.id}
                  d={threadPath(positionOf(from), positionOf(to))}
                  fill="none"
                  stroke={threadStroke(thread?.color ?? 'paper')}
                  strokeWidth={thread ? 3 : 2}
                  strokeDasharray={thread ? undefined : '6 6'}
                  strokeLinecap="round"
                />
              );
            })}
            {linking &&
              (() => {
                const from = byId.get(linking.from);
                if (!from) return null;
                const start = positionOf(from);
                return (
                  <line
                    x1={start.x + CARD_WIDTH}
                    y1={start.y + CARD_HEIGHT / 2}
                    x2={linking.to.x}
                    y2={linking.to.y}
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    strokeLinecap="round"
                  />
                );
              })()}
          </svg>
          {cards.map((card) => (
            <BoardCard
              key={card.id}
              card={card}
              at={positionOf(card)}
              scale={current.scale}
              itemTitle={card.itemId ? itemTitles.get(card.itemId) : undefined}
              helpId={helpId}
              actions={actions}
              onDrag={setPosition}
              onRelease={release}
              onKeyMove={keyMove}
              onOpen={open}
              pinching={pinching}
              onLinkDrag={dragLink}
              onLinkDrop={dropLink}
              cardAt={cardAt}
            />
          ))}
        </div>
        {cards.length === 0 && (
          <p className="absolute inset-x-0 top-1/3 mx-auto max-w-sm px-4 text-center text-muted">
            The board is empty. Add a card, or make one card for each scene with Cards from scenes.
          </p>
        )}
        <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-[var(--radius-card)] border border-rule bg-surface p-1 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            className="min-w-11 px-0"
            aria-label="Zoom out"
            onClick={() => {
              zoomBy(1 / ZOOM_STEP);
            }}
          >
            <Minus aria-hidden="true" className="size-4" />
          </Button>
          <output aria-live="polite" aria-label="Zoom" className="w-14 text-center tabular-nums text-sm">
            {Math.round(current.scale * 100)} %
          </output>
          <Button
            type="button"
            variant="ghost"
            className="min-w-11 px-0"
            aria-label="Zoom in"
            onClick={() => {
              zoomBy(ZOOM_STEP);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-w-11 px-0"
            aria-label="Fit all cards"
            onClick={() => {
              if (size) onView(fitAll(cards, size));
            }}
          >
            <Maximize aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface BoardCardProps {
  card: Card;
  at: Point;
  scale: number;
  itemTitle: string | undefined;
  helpId: string;
  actions: CardActions;
  onDrag: (id: string, at: Point | null) => void;
  onRelease: (card: Card, at: Point, velocity: Point) => void;
  onKeyMove: (card: Card, dx: number, dy: number) => void;
  onOpen: (card: Card) => void;
  /** True while two fingers are on the board. */
  pinching: () => boolean;
  onLinkDrag: (from: Card, to: Point | null) => void;
  onLinkDrop: (from: Card, target: Card | undefined) => void;
  cardAt: (clientX: number, clientY: number) => Card | undefined;
}

const BoardCard = memo(function BoardCard({
  card,
  at,
  scale,
  itemTitle,
  helpId,
  actions,
  onDrag,
  onRelease,
  onKeyMove,
  onOpen,
  pinching,
  onLinkDrag,
  onLinkDrop,
  cardAt,
}: BoardCardProps) {
  const bind = useDrag(
    ({ movement: [mx, my], velocity: [vx, vy], direction: [dx, dy], last, tap, event, cancel }) => {
      if (tap) return;
      event.stopPropagation();
      // A second finger makes the gesture a pinch of the board: the card goes back to its place.
      if (pinching()) {
        cancel();
        onDrag(card.id, null);
        return;
      }
      const next = { x: card.x + mx / scale, y: card.y + my / scale };
      if (last) onRelease(card, next, { x: (vx * dx) / scale, y: (vy * dy) / scale });
      else onDrag(card.id, next);
    },
    { filterTaps: true, pointer: { keys: false } },
  );

  // The link handle on the right edge: drag it onto another card to link the two (plan Task C2).
  const bindLink = useDrag(
    ({ movement: [mx, my], xy: [px, py], last, tap, event }) => {
      event.stopPropagation();
      if (tap) {
        onLinkDrag(card, null);
        return;
      }
      if (last) {
        onLinkDrop(card, cardAt(px, py));
        return;
      }
      onLinkDrag(card, { x: card.x + CARD_WIDTH + mx / scale, y: card.y + CARD_HEIGHT / 2 + my / scale });
    },
    { filterTaps: true, pointer: { keys: false } },
  );
  const linkHandlers = bindLink();

  const style: CSSProperties = {
    transform: `translate(${String(at.x)}px, ${String(at.y)}px)`,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    background: cardBackground(card.color),
  };
  return (
    <MotionViewTransition name={cardTransitionName(card.id)} update="none">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see tabIndex below. */}
      <div
        {...bind()}
        data-board-card=""
        data-card-id={card.id}
        role="group"
        aria-roledescription="card"
        aria-label={card.title}
        aria-describedby={helpId}
        // The card is a widget of its own: it moves with the arrow keys and opens with Enter, and its
        // menu button sits inside it, so it cannot be a button. The board's help text names the keys.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onDoubleClick={() => {
          onOpen(card);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const step = event.shiftKey ? GRID * 8 : GRID;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const move = moves[event.key];
          if (move) {
            event.preventDefault();
            onKeyMove(card, move[0], move[1]);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            onOpen(card);
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            actions.remove(card);
          }
        }}
        className="absolute top-0 left-0 flex touch-none cursor-grab flex-col rounded-[var(--radius-card)] border border-rule p-3 shadow-sm active:cursor-grabbing"
        style={style}
      >
        <div className="flex items-start gap-1">
          <h3 className="line-clamp-2 min-w-0 flex-1 font-display text-lg leading-snug font-semibold [overflow-wrap:anywhere]">
            {card.title}
          </h3>
          <CardMenu card={card} actions={actions} className="-mt-2 -mr-2" />
        </div>
        {card.note && <p className="mt-1 line-clamp-2 text-sm text-muted">{card.note}</p>}
        {itemTitle !== undefined && (
          <p className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted">
            <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{itemTitle}</span>
          </p>
        )}
        {/* Pointer only: a keyboard or screen reader user links cards with Links… in the card menu. */}
        <div
          {...linkHandlers}
          aria-hidden="true"
          data-link-handle=""
          title="Drag to another card to link them"
          onPointerDown={(event) => {
            linkHandlers.onPointerDown?.(event);
            // The press belongs to the link, so the card itself does not move.
            event.stopPropagation();
          }}
          className="group absolute top-1/2 -right-[22px] flex size-11 -translate-y-1/2 touch-none cursor-crosshair items-center justify-center"
        >
          <span className="size-3 rounded-full border-2 border-text/60 bg-surface transition-transform group-hover:scale-125" />
        </div>
      </div>
    </MotionViewTransition>
  );
});

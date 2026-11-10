import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { memo, useRef, useState, type ReactNode } from 'react';
import { STATUS_LABEL } from '@/features/binder/BinderItem';
import { formatWords } from '@/features/library/format';
import type { CountUnit } from '@/lib/wordcount';
import type { Item } from '@/lib/db';
import { cn } from '@/ui/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';

/*
 * The poems of one order as cards (spec 8.3, plan Task C6), and the index cards of the Outline (F40). A drag,
 * the keyboard (Space, the arrow keys, Space) or a card's menu moves a card. The cards that make room move
 * with ease-in-out and no overshoot (plan Part J0), and Calm mode drops at once.
 */

const MOUSE_OPTIONS = { activationConstraint: { distance: 4 } };
const TOUCH_OPTIONS = { activationConstraint: { delay: 250, tolerance: 5 } };
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

/** Movement on the screen eases in and out, with no overshoot. */
const SETTLE = { duration: 300, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' };

const INSTRUCTIONS =
  'To pick up a card, press Space or Enter. Use the arrow keys to move it. Press Space or Enter again to drop it, or Escape to cancel. The card menu also has Move earlier and Move later.';

export interface SequenceActions {
  /** Moves the poem at `from` to `to`. */
  move: (from: number, to: number) => void;
  open: (poem: Item) => void;
}

interface CardProps {
  poem: Item;
  index: number;
  count: number;
  motion: boolean;
  actions: SequenceActions;
  noun: string;
  details: ((item: Item) => ReactNode) | undefined;
  unit: CountUnit;
}

const PoemCard = memo(function PoemCard({
  poem,
  index,
  count,
  motion,
  actions,
  noun,
  details,
  unit,
}: CardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: poem.id, transition: motion ? SETTLE : null });
  const [open, setOpen] = useState(false);
  const touchPress = useRef(false);
  const items: [string, number][] = [
    ['Move to the start', 0],
    ['Move earlier', index - 1],
    ['Move later', index + 1],
    ['Move to the end', count - 1],
  ];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10')}
      aria-label={`${String(index + 1)}. ${poem.title}`}
    >
      <div
        className={cn(
          'flex h-full items-start gap-1 rounded-[var(--radius-card)] border border-rule bg-surface p-2',
          isDragging && 'shadow-[var(--shadow-hover)]',
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Move ${poem.title}`}
          className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted hover:text-text active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
        <div className="min-w-0 flex-1 py-1.5">
          <p className="tabular-nums text-xs text-muted" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </p>
          <button
            type="button"
            onClick={() => {
              actions.open(poem);
            }}
            className="mt-0.5 block w-full text-left font-display text-lg font-semibold [overflow-wrap:anywhere] hover:text-accent-text"
          >
            {poem.title}
          </button>
          {details ? (
            details(poem)
          ) : (
            <p className="mt-0.5 text-xs text-muted">
              {formatWords(poem.wordCount, unit)}, {STATUS_LABEL[poem.status].toLowerCase()}
            </p>
          )}
        </div>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger
            aria-label={`Options for ${poem.title}`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text"
            // A finger opens the menu on the tap, so a scroll can start on the button.
            onPointerDown={(event) => {
              touchPress.current = event.pointerType !== 'mouse';
              if (touchPress.current) event.preventDefault();
            }}
            onClick={() => {
              if (!touchPress.current) return;
              touchPress.current = false;
              setOpen((now) => !now);
            }}
          >
            <MoreHorizontal aria-hidden="true" className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                actions.open(poem);
              }}
            >
              Open {noun}
            </DropdownMenuItem>
            {items.map(([label, to]) => (
              <DropdownMenuItem
                key={label}
                disabled={to < 0 || to >= count || to === index}
                onSelect={() => {
                  actions.move(index, to);
                }}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
});

export function SequenceList({
  name,
  poems,
  motion,
  actions,
  noun = 'poem',
  details,
  unit = 'words',
}: {
  name: string;
  poems: readonly Item[];
  motion: boolean;
  actions: SequenceActions;
  /** What a card holds, such as "poem", for the menu and the list name. */
  noun?: string;
  /** The line under a card's title. A poem shows its words and status. */
  details?: (item: Item) => ReactNode;
  /** The count unit of the project's language (F38). */
  unit?: CountUnit;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_OPTIONS),
    useSensor(TouchSensor, TOUCH_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );
  const ids = poems.map((p) => p.id);
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const titleOf = (id: string | number) => poems.find((p) => p.id === id)?.title ?? Noun;
  const placeOf = (id: string | number) => ids.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(active.id)}. It is ${String(placeOf(active.id))} of ${String(ids.length)}.`,
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? `${titleOf(active.id)} is at place ${String(placeOf(over.id))} of ${String(ids.length)}.`
        : undefined,
    // The page says where the poem went, after the order is saved.
    onDragEnd: () => undefined,
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
  };

  const dragEnd = (event: DragEndEvent) => {
    const over = event.over;
    if (!over || over.id === event.active.id) return;
    actions.move(ids.indexOf(String(event.active.id)), ids.indexOf(String(over.id)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={dragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <ol aria-label={`${Noun}s in ${name}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {poems.map((poem, index) => (
            <PoemCard
              key={poem.id}
              poem={poem}
              index={index}
              count={poems.length}
              motion={motion}
              actions={actions}
              noun={noun}
              details={details}
              unit={unit}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

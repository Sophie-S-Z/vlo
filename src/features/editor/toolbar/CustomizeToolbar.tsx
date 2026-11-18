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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Switch } from '@/ui/switch';
import { command } from '../commands/registry';
import { setWriterTools, useWriterTools } from '../writerTools';
import { DEFAULT_PINNED } from './toolbarLayout';

/*
 * "Customize toolbar" (Phase 19, Task E1): a switch pins each tool, and a drag, the keyboard or the arrow
 * buttons order the pinned tools. The list shows the tools of one form, or of every form in Settings. A
 * change keeps the order of the pinned tools that the list does not show.
 */

const MOUSE_OPTIONS = { activationConstraint: { distance: 4 } };
const TOUCH_OPTIONS = { activationConstraint: { delay: 250, tolerance: 5 } };
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };
const INSTRUCTIONS =
  'To pick up a tool, press Space or Enter. Use the arrow keys to move it. Press Space or Enter again to drop it, or Escape to cancel.';

/** The full list with the shown tools in their new order, each in a place that a shown tool had. */
export function withOrder(full: readonly string[], shown: readonly string[]): string[] {
  const moving = new Set(shown);
  let next = 0;
  return full.map((id) => (moving.has(id) ? (shown[next++] ?? id) : id));
}

const labelOf = (id: string) => command(id).label;

function PinnedRow({
  id,
  index,
  count,
  onMove,
  onUnpin,
}: {
  id: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onUnpin: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const cmd = command(id);
  const Icon = cmd.icon;
  const switchId = useId();
  const arrow =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text disabled:opacity-40 pointer-fine:size-9';
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-md border border-rule bg-surface px-1 ${isDragging ? 'relative z-10 shadow-[var(--shadow-hover)]' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Move ${cmd.label}`}
        className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted hover:text-text active:cursor-grabbing pointer-fine:size-9"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
      <label htmlFor={switchId} className="min-w-0 flex-1 cursor-pointer py-2 text-sm">
        {cmd.label}
      </label>
      <button
        type="button"
        aria-label={`Move ${cmd.label} up`}
        disabled={index === 0}
        className={arrow}
        onClick={() => {
          onMove(index, index - 1);
        }}
      >
        <ArrowUp aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`Move ${cmd.label} down`}
        disabled={index === count - 1}
        className={arrow}
        onClick={() => {
          onMove(index, index + 1);
        }}
      >
        <ArrowDown aria-hidden="true" className="size-4" />
      </button>
      <Switch id={switchId} checked onCheckedChange={onUnpin} className="mx-1" />
    </li>
  );
}

function OtherRow({ id, onPin }: { id: string; onPin: () => void }) {
  const cmd = command(id);
  const Icon = cmd.icon;
  const switchId = useId();
  return (
    <li className="flex items-center gap-2 px-2">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
      <label htmlFor={switchId} className="min-w-0 flex-1 cursor-pointer py-2.5 text-sm">
        {cmd.label}
      </label>
      <Switch id={switchId} checked={false} onCheckedChange={onPin} className="mx-1" />
    </li>
  );
}

export function CustomizeToolbar({
  open,
  onOpenChange,
  tools,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tools that the list shows, in menu order. */
  tools: readonly string[];
}) {
  const own = useWriterTools();
  const [message, setMessage] = useState('');
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_OPTIONS),
    useSensor(TouchSensor, TOUCH_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );
  const full = own.toolbar ?? [...DEFAULT_PINNED];
  const offered = new Set(tools);
  const pinned = full.filter((id) => offered.has(id));
  const others = tools.filter((id) => !full.includes(id));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= pinned.length || to === from) return;
    const id = pinned[from];
    if (!id) return;
    setWriterTools({ toolbar: withOrder(full, arrayMove(pinned, from, to)) });
    setMessage(`${labelOf(id)} is at place ${String(to + 1)} of ${String(pinned.length)}.`);
  };
  const dragEnd = (event: DragEndEvent) => {
    const over = event.over;
    if (!over || over.id === event.active.id) return;
    move(pinned.indexOf(String(event.active.id)), pinned.indexOf(String(over.id)));
  };
  const placeOf = (id: string | number) => pinned.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${labelOf(String(active.id))}. It is ${String(placeOf(active.id))} of ${String(pinned.length)}.`,
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? `${labelOf(String(active.id))} is at place ${String(placeOf(over.id))} of ${String(pinned.length)}.`
        : undefined,
    // The status line says where the tool went, after the order is saved.
    onDragEnd: () => undefined,
    onDragCancel: ({ active }) => `Moving ${labelOf(String(active.id))} was cancelled.`,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Customize toolbar</DialogTitle>
        <DialogDescription>
          Pin the tools that you use most. A pinned tool also stays in its menu. A phone shows the first four,
          and the More menu lists the others.
        </DialogDescription>
        <section aria-labelledby="pinned-tools" className="grid gap-2">
          <h3 id="pinned-tools" className="text-sm font-medium">
            On the toolbar
          </h3>
          {pinned.length === 0 ? (
            <p className="text-sm text-muted">No tools are pinned. Every tool is in the menus.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={dragEnd}
              accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
            >
              <SortableContext items={pinned} strategy={verticalListSortingStrategy}>
                <ol aria-label="Tools on the toolbar" className="grid gap-1">
                  {pinned.map((id, index) => (
                    <PinnedRow
                      key={id}
                      id={id}
                      index={index}
                      count={pinned.length}
                      onMove={move}
                      onUnpin={() => {
                        setWriterTools({ toolbar: full.filter((tool) => tool !== id) });
                        setMessage(`${labelOf(id)} is off the toolbar.`);
                      }}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </section>
        {others.length > 0 && (
          <section aria-labelledby="other-tools" className="grid gap-1">
            <h3 id="other-tools" className="text-sm font-medium">
              In the menus only
            </h3>
            <ul aria-label="Tools in the menus only" className="grid divide-y divide-rule">
              {others.map((id) => (
                <OtherRow
                  key={id}
                  id={id}
                  onPin={() => {
                    setWriterTools({ toolbar: [...full, id] });
                    setMessage(`${labelOf(id)} is on the toolbar, at the end.`);
                  }}
                />
              ))}
            </ul>
          </section>
        )}
        <p role="status" className="sr-only">
          {message}
        </p>
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="outline"
            disabled={own.toolbar === null}
            onClick={() => {
              setWriterTools({ toolbar: null });
              setMessage('The toolbar has Vlo’s own tools again.');
            }}
          >
            Reset the toolbar
          </Button>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

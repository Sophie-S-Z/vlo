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
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { projectDef } from '@/features/library/templates';
import type { Item, ItemKind, Project, Status } from '@/lib/db';
import { Button } from '@/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { BinderItem, INDENT_PX, type BinderItemActions, type BinderMove } from './BinderItem';
import { ItemDialogs, type ItemAction } from './ItemDialogs';
import { addItem, moveItem, nextTitle, updateItem } from './items';
import {
  descendantIds,
  flattenTree,
  indentTarget,
  moveTarget,
  outdentTarget,
  projectDrop,
  type FlatNode,
  type Placement,
} from './tree';

interface BinderProps {
  project: Project;
  items: Item[];
  openItemId: string | null;
  onOpen: (itemId: string) => void;
}

/*
 * useSensor keeps a sensor only while its options object stays the same. New objects on each render would
 * give every sortable row new listeners, and opening one item would re-render all of them.
 */
const MOUSE_OPTIONS = { activationConstraint: { distance: 4 } };
const TOUCH_OPTIONS = { activationConstraint: { delay: 250, tolerance: 5 } };
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

const INSTRUCTIONS =
  'To pick up an item, press Space or Enter. Use the arrow keys to move it. Press Space or Enter again to drop it, or Escape to cancel. The item menu also has Move up, Move down, Indent and Outdent.';

/** "Scene 2 moved. It is now 1 of 2 in Chapter 1." */
function describeMove(nodes: readonly FlatNode[], item: Item, placement: Placement): string {
  const siblings = nodes
    .filter((n) => n.parentId === placement.parentId && n.item.id !== item.id)
    .map((n) => n.item.order);
  const position = siblings.filter((order) => order < placement.order).length + 1;
  const parent = nodes.find((n) => n.item.id === placement.parentId)?.item.title ?? 'the top level';
  return `${item.title} moved. It is now ${String(position)} of ${String(siblings.length + 1)} in ${parent}.`;
}

export function Binder({ project, items, openItemId, onOpen }: BinderProps) {
  const template = useMemo(() => projectDef(project.templates), [project.templates]);
  const nodes = useMemo(() => flattenTree(items), [items]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<ItemAction>(null);
  const addToEditor = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_OPTIONS),
    useSensor(TouchSensor, TOUCH_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );

  const hidden = useMemo(
    () => (activeId ? descendantIds(nodes, activeId) : new Set<string>()),
    [nodes, activeId],
  );
  const visible = useMemo(() => nodes.filter((n) => !hidden.has(n.item.id)), [nodes, hidden]);
  // A stable id list keeps SortableContext's value the same, so opening an item re-renders only two rows.
  const visibleIds = useMemo(() => visible.map((n) => n.item.id), [visible]);
  const offsetDepth = Math.round(offsetX / INDENT_PX);
  const projection = activeId && overId ? projectDrop(nodes, activeId, overId, offsetDepth, template) : null;
  const titleOf = (id: string | number) => nodes.find((n) => n.item.id === id)?.item.title ?? 'Item';

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    // A drag starts over its own row. Saying so would cut off "Picked up", so only real moves speak.
    onDragOver: ({ active, over }) => {
      if (!over) return `${titleOf(active.id)} is outside the binder.`;
      return over.id === active.id ? undefined : `${titleOf(active.id)} is over ${titleOf(over.id)}.`;
    },
    onDragEnd: () => undefined,
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
  };

  function reset() {
    setActiveId(null);
    setOverId(null);
    setOffsetX(0);
  }

  async function place(item: Item, placement: Placement | null) {
    if (!placement) return;
    await moveItem(item.id, placement.parentId, placement.order);
    setMessage(describeMove(nodes, item, placement));
  }

  async function dragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    const node = nodes.find((n) => n.item.id === id);
    reset();
    if (!node || !over) return;
    const placement = projectDrop(nodes, id, over, Math.round(event.delta.x / INDENT_PX), template);
    if (!placement) {
      setMessage(`${node.item.title} cannot go there. Nothing moved.`);
      return;
    }
    // Dropped where it started: nothing moves.
    if (over === id && placement.parentId === node.parentId) return;
    await place(node.item, placement);
  }

  async function add(parentId: string | null, kind: ItemKind) {
    const label = template.kindLabel[kind] ?? kind;
    const item = await addItem(project.id, parentId, kind, await nextTitle(project.id, kind, label));
    setMessage(`Added ${item.title}.`);
    if (template.editorKind(kind) !== null) onOpen(item.id);
  }

  // Rows get one stable actions object, so a drag move does not re-render every row. It reads the latest state here.
  const latest = useRef({ nodes, template, onOpen, place, add });
  useEffect(() => {
    latest.current = { nodes, template, onOpen, place, add };
  });

  const actions = useMemo<BinderItemActions>(() => {
    const targetOf = (item: Item, move: BinderMove): Placement | null => {
      const { nodes: rows, template: def } = latest.current;
      if (move === 'up' || move === 'down') return moveTarget(rows, item.id, move);
      return move === 'indent' ? indentTarget(rows, item.id, def) : outdentTarget(rows, item.id, def);
    };
    return {
      open: (item) => {
        latest.current.onOpen(item.id);
      },
      rename: (item) => {
        setAction({ type: 'rename', item, hasChildren: false });
      },
      synopsis: (item) => {
        setAction({ type: 'synopsis', item, hasChildren: false });
      },
      remove: (item) => {
        const hasChildren = latest.current.nodes.some((n) => n.parentId === item.id);
        setAction({ type: 'delete', item, hasChildren });
      },
      setStatus: (item, status: Status) => {
        void updateItem(item.id, { status });
      },
      addChild: (item, kind) => {
        void latest.current.add(item.id, kind);
      },
      canMove: (item, move) => targetOf(item, move) !== null,
      move: (item, move) => {
        void latest.current.place(item, targetOf(item, move));
      },
    };
  }, []);

  const rootKinds = template.childKinds.root ?? [];

  return (
    <nav aria-label="Binder" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Binder</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label="Add to binder">
              <Plus aria-hidden="true" className="size-4" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              // A new writable item opens in the editor, which takes the focus.
              if (addToEditor.current) event.preventDefault();
              addToEditor.current = false;
            }}
          >
            {rootKinds.map((kind) => (
              <DropdownMenuItem
                key={kind}
                onSelect={() => {
                  addToEditor.current = template.editorKind(kind) !== null;
                  void add(null, kind);
                }}
              >
                {template.kindLabel[kind] ?? kind}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
        onDragStart={({ active }) => {
          setActiveId(String(active.id));
          setOverId(String(active.id));
        }}
        onDragMove={({ delta }) => {
          setOffsetX(delta.x);
        }}
        onDragOver={({ over }) => {
          setOverId(over ? String(over.id) : null);
        }}
        onDragEnd={(event) => void dragEnd(event)}
        onDragCancel={reset}
      >
        <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
          <ul aria-label="Binder items" className="grid gap-0.5">
            {visible.map((node) => {
              const dragging = node.item.id === activeId;
              return (
                <BinderItem
                  key={node.item.id}
                  item={node.item}
                  depth={dragging ? (projection?.depth ?? node.depth) : node.depth}
                  template={template}
                  isOpen={node.item.id === openItemId}
                  refused={dragging && overId !== null && projection === null}
                  actions={actions}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>

      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>

      <ItemDialogs
        action={action}
        onClose={() => {
          setAction(null);
        }}
        onDeleted={(item) => {
          setMessage(`Deleted ${item.title}.`);
        }}
      />
    </nav>
  );
}

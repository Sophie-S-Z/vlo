import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Ellipsis, GripVertical } from 'lucide-react';
import { memo, useRef } from 'react';
import type { TemplateDef } from '@/features/library/templates';
import { threadStroke } from '@/features/board/board';
import type { Item, ItemKind, Label, Status } from '@/lib/db';
import { formatDate } from '@/features/timeline/dates';
import { cn } from '@/ui/cn';
import type { FormAction } from './ItemDialogs';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';

export const INDENT_PX = 20;

export const STATUS_LABEL: Record<Status, string> = {
  idea: 'Idea',
  draft: 'Draft',
  revised: 'Revised',
  done: 'Done',
};

export type BinderMove = 'up' | 'down' | 'indent' | 'outdent';

/** One stable set of actions for every row. Move targets are worked out only when a menu opens. */
export interface BinderItemActions {
  open: (item: Item) => void;
  openBeside: (item: Item) => void;
  /** Opens the dialog that edits the title, the synopsis or the story date (F67). */
  edit: (item: Item, type: FormAction) => void;
  remove: (item: Item) => void;
  setStatus: (item: Item, status: Status) => void;
  /** Shows the section's title as a heading in exports, or keeps it as a working label (Phase 17). */
  setWorkingTitle: (item: Item, on: boolean) => void;
  addChild: (item: Item, kind: ItemKind) => void;
  canMove: (item: Item, move: BinderMove) => boolean;
  move: (item: Item, move: BinderMove) => void;
}

const EDITS: { type: FormAction; label: string }[] = [
  { type: 'rename', label: 'Rename' },
  { type: 'synopsis', label: 'Edit synopsis' },
  { type: 'story-date', label: 'Story date' },
];

const MOVES: { move: BinderMove; label: string }[] = [
  { move: 'up', label: 'Move up' },
  { move: 'down', label: 'Move down' },
  { move: 'indent', label: 'Indent' },
  { move: 'outdent', label: 'Outdent' },
];

/** Radix mounts menu content only while the menu is open, so this work runs once per open menu. */
function MoveItems({ item, actions }: { item: Item; actions: BinderItemActions }) {
  return MOVES.map(({ move, label }) => (
    <DropdownMenuItem
      key={move}
      disabled={!actions.canMove(item, move)}
      onSelect={() => {
        actions.move(item, move);
      }}
    >
      {label}
    </DropdownMenuItem>
  ));
}

interface BinderItemProps {
  item: Item;
  depth: number;
  template: TemplateDef;
  isOpen: boolean;
  /** A wide screen can open the item beside the open one (F39). */
  canOpenBeside: boolean;
  /** True while this row is dragged to a place the template does not allow. */
  refused: boolean;
  /** The item's label (F40), or null. */
  label: Label | null;
  actions: BinderItemActions;
}

export const BinderItem = memo(function BinderItem({
  item,
  depth,
  template,
  isOpen,
  canOpenBeside,
  refused,
  label,
  actions,
}: BinderItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const toEditor = useRef(false);
  const writable = template.editorKind(item.kind) !== null;
  // A memory has its own date on the Memory Timeline.
  const dated = writable && item.kind !== 'memory';
  const kindLabel = template.kindLabel[item.kind] ?? item.kind;
  const childKinds = template.childKinds[item.kind] ?? [];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10')}
    >
      <div
        className={cn(
          'group flex items-start gap-1 rounded-md border border-transparent py-1 pr-1',
          isOpen && 'bg-surface',
          isDragging && 'border-rule bg-surface shadow-[var(--shadow-hover)]',
          refused && 'border-dashed border-accent',
        )}
        style={{ paddingLeft: depth * INDENT_PX }}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Move ${item.title}`}
          className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted hover:text-text active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
        <div className="min-w-0 flex-1 py-1.5">
          {writable ? (
            <button
              type="button"
              onClick={() => {
                actions.open(item);
              }}
              aria-current={isOpen ? 'page' : undefined}
              className="block w-full text-left font-medium [overflow-wrap:anywhere] hover:text-accent-text"
              data-binder-title
            >
              {item.title}
            </button>
          ) : (
            <span className="block font-display font-semibold [overflow-wrap:anywhere]" data-binder-title>
              {item.title}
            </span>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{kindLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{STATUS_LABEL[item.status]}</span>
            {item.storyDate && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatDate(item.storyDate)}</span>
              </>
            )}
            {label && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className="inline-block size-2 rounded-full"
                    style={{ background: threadStroke(label.color) }}
                  />
                  {label.name}
                </span>
              </>
            )}
          </p>
          {item.synopsis && <p className="mt-1 line-clamp-2 text-sm text-muted">{item.synopsis}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Options for ${item.title}`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text"
          >
            <Ellipsis aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            // The menu is tall. On a short screen it scrolls, so every action stays in reach.
            className="max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
            onCloseAutoFocus={(event) => {
              // Open and Add move the cursor into the editor. Returning focus to this button would take it back.
              if (toEditor.current) event.preventDefault();
              toEditor.current = false;
            }}
          >
            {writable && (
              <DropdownMenuItem
                onSelect={() => {
                  toEditor.current = true;
                  actions.open(item);
                }}
              >
                Open
              </DropdownMenuItem>
            )}
            {writable && canOpenBeside && !isOpen && (
              <DropdownMenuItem
                onSelect={() => {
                  actions.openBeside(item);
                }}
              >
                Open beside
              </DropdownMenuItem>
            )}
            {EDITS.filter(({ type }) => type !== 'story-date' || dated).map(({ type, label }) => (
              <DropdownMenuItem
                key={type}
                onSelect={() => {
                  actions.edit(item, type);
                }}
              >
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={item.status}
                  onValueChange={(value) => {
                    actions.setStatus(item, value as Status);
                  }}
                >
                  {(Object.keys(STATUS_LABEL) as Status[]).map((status) => (
                    <DropdownMenuRadioItem key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {/* A section of an essay, an article or a research paper (Phase 17). */}
            {item.kind === 'page' && kindLabel === 'Section' && item.role === undefined && (
              <DropdownMenuCheckboxItem
                checked={!item.workingTitle}
                onCheckedChange={(checked) => {
                  actions.setWorkingTitle(item, !checked);
                }}
              >
                Title as a heading in exports
              </DropdownMenuCheckboxItem>
            )}
            {childKinds.length > 0 && <DropdownMenuSeparator />}
            {childKinds.map((kind) => (
              <DropdownMenuItem
                key={kind}
                onSelect={() => {
                  toEditor.current = template.editorKind(kind) !== null;
                  actions.addChild(item, kind);
                }}
              >
                Add {template.kindLabel[kind] ?? kind} inside
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <MoveItems item={item} actions={actions} />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                actions.remove(item);
              }}
              className="text-accent-text"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
});

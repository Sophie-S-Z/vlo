import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Ellipsis, GripVertical } from 'lucide-react';
import type { TemplateDef } from '@/features/library/templates';
import type { Item, ItemKind, Status } from '@/lib/db';
import { cn } from '@/ui/cn';
import {
  DropdownMenu,
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

export interface BinderItemActions {
  open: () => void;
  rename: () => void;
  synopsis: () => void;
  remove: () => void;
  setStatus: (status: Status) => void;
  addChild: (kind: ItemKind) => void;
  moveUp: (() => void) | null;
  moveDown: (() => void) | null;
  indent: (() => void) | null;
  outdent: (() => void) | null;
}

interface BinderItemProps {
  item: Item;
  depth: number;
  template: TemplateDef;
  isOpen: boolean;
  /** True while this row is dragged to a place the template does not allow. */
  refused: boolean;
  actions: BinderItemActions;
}

export function BinderItem({ item, depth, template, isOpen, refused, actions }: BinderItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const writable = template.editorKind(item.kind) !== null;
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
              onClick={actions.open}
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
          <DropdownMenuContent align="end">
            {writable && <DropdownMenuItem onSelect={actions.open}>Open</DropdownMenuItem>}
            <DropdownMenuItem onSelect={actions.rename}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={actions.synopsis}>Edit synopsis</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={item.status}
                  onValueChange={(value) => {
                    actions.setStatus(value as Status);
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
            {childKinds.length > 0 && <DropdownMenuSeparator />}
            {childKinds.map((kind) => (
              <DropdownMenuItem
                key={kind}
                onSelect={() => {
                  actions.addChild(kind);
                }}
              >
                Add {template.kindLabel[kind] ?? kind} inside
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!actions.moveUp} onSelect={actions.moveUp ?? undefined}>
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!actions.moveDown} onSelect={actions.moveDown ?? undefined}>
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!actions.indent} onSelect={actions.indent ?? undefined}>
              Indent
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!actions.outdent} onSelect={actions.outdent ?? undefined}>
              Outdent
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={actions.remove} className="text-accent-text">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

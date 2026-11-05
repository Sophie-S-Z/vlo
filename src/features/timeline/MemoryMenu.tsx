import { MoreHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Item } from '@/lib/db';
import { cn } from '@/ui/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';

/** What the writer can do with a memory. The track, the shelf, the theme columns and the list share it. */
export interface MemoryActions {
  open: (memory: Item) => void;
  edit: (memory: Item) => void;
  /** Makes a dated memory undated, so it goes to the shelf. */
  clearDate: (memory: Item) => void;
}

export function MemoryMenu({
  memory,
  actions,
  className,
}: {
  memory: Item;
  actions: MemoryActions;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const touchPress = useRef(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Options for ${memory.title}`}
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text',
          className,
        )}
        // A press here never starts a drag of the memory. A finger opens the menu on the tap, so a pan or
        // a pinch can start on the button.
        onPointerDown={(event) => {
          event.stopPropagation();
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
            actions.open(memory);
          }}
        >
          Open memory
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            actions.edit(memory);
          }}
        >
          Date, stage and themes…
        </DropdownMenuItem>
        {memory.memory?.date !== undefined && (
          <DropdownMenuItem
            onSelect={() => {
              actions.clearDate(memory);
            }}
          >
            Remove the date
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

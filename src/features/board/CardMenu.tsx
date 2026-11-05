import { MoreHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Card } from '@/lib/db';
import { cn } from '@/ui/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';

/** What the writer can do with a card. The board, the Plot Grid and the List view share it. */
export interface CardActions {
  edit: (card: Card) => void;
  links: (card: Card) => void;
  /** Opens the card's scene. Only for a card that stands for an item. */
  open: (card: Card) => void;
  remove: (card: Card) => void;
  /** Moves the card's scene to another chapter. The Plot Grid offers it. */
  moveToChapter?: (card: Card) => void;
  /** Moves the card to another thread. The Plot Grid offers it, for the column the card is in. */
  moveToThread?: (card: Card) => void;
}

export function CardMenu({
  card,
  actions,
  className,
}: {
  card: Card;
  actions: CardActions;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const touchPress = useRef(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Options for ${card.title}`}
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text',
          className,
        )}
        // The menu button sits on a card that the writer can drag, so a press here never starts a drag.
        // A finger opens the menu on the tap, not on the press, so a pan or a pinch can start here.
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
        {card.itemId !== undefined && (
          <DropdownMenuItem
            onSelect={() => {
              actions.open(card);
            }}
          >
            Open scene
          </DropdownMenuItem>
        )}
        {card.itemId !== undefined && actions.moveToChapter && (
          <DropdownMenuItem
            onSelect={() => {
              actions.moveToChapter?.(card);
            }}
          >
            Move scene to chapter…
          </DropdownMenuItem>
        )}
        {actions.moveToThread && (
          <DropdownMenuItem
            onSelect={() => {
              actions.moveToThread?.(card);
            }}
          >
            Move to thread…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            actions.edit(card);
          }}
        >
          Edit card…
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            actions.links(card);
          }}
        >
          Links…
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-accent-text"
          onSelect={() => {
            actions.remove(card);
          }}
        >
          Delete card
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

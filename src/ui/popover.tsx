import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/*
 * Opening grows from the trigger at scale 0.95 in 200 ms, ease-out. Closing is at once, with no fade-out: Radix keeps a closing layer until its
 * animationend event, and WebKit did not send that event while a scene moved, so the layer stayed.
 */

export const Popover = PopoverPrimitive.Root;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  sideOffset = 6,
  collisionPadding = 12,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-50 max-h-[var(--radix-popover-content-available-height)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[var(--radius-card)] border border-rule bg-surface p-3 text-text shadow-lg outline-none origin-(--radix-popover-content-transform-origin) data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200 data-[state=open]:ease-out',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

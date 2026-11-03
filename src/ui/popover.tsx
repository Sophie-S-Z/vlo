import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

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
          'z-50 max-h-[var(--radix-popover-content-available-height)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[var(--radius-card)] border border-rule bg-surface p-3 text-text shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

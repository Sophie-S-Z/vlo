import type { ComponentProps } from 'react';
import { cn } from './cn';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-md border border-rule bg-bg px-3 py-2 text-base text-text placeholder:text-muted focus-visible:border-accent',
        className,
      )}
      {...props}
    />
  );
}

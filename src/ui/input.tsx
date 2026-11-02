import type { ComponentProps } from 'react';
import { cn } from './cn';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'min-h-11 w-full rounded-md border border-rule bg-bg px-3 text-base text-text placeholder:text-muted focus-visible:border-accent aria-invalid:border-accent',
        className,
      )}
      {...props}
    />
  );
}

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} />;
}

export function RadioGroupItem({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-muted bg-surface data-[state=checked]:border-accent',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="block size-2.5 rounded-full bg-accent" />
    </RadioGroupPrimitive.Item>
  );
}

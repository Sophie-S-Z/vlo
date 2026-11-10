import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/*
 * The knob stretches 12% toward its travel while the switch is pressed (plan Part J0). A checked knob
 * moves left by the stretch, so its right edge stays in place.
 */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer group inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-muted bg-rule transition-colors duration-200 ease-in-out data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-surface shadow-sm ring-1 ring-muted transition-[translate,width] duration-200 ease-in-out group-active:w-[1.4rem] data-[state=checked]:translate-x-[1.375rem] data-[state=checked]:ring-0 group-active:data-[state=checked]:translate-x-[1.225rem]" />
    </SwitchPrimitive.Root>
  );
}

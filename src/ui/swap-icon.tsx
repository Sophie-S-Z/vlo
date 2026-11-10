import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Two icons in one place that crossfade with scale and blur when `on` changes (plan Part J0), such as Copy
 * and Check. Both stay in the tree, so the button keeps its width.
 */
export function SwapIcon({ on, off, onIcon }: { on: boolean; off: ReactNode; onIcon: ReactNode }) {
  return (
    <span aria-hidden="true" className="grid size-4 *:col-start-1 *:row-start-1">
      <span className={cn('vlo-swap', on && 'vlo-swap-out')}>{off}</span>
      <span className={cn('vlo-swap', !on && 'vlo-swap-out')}>{onIcon}</span>
    </span>
  );
}

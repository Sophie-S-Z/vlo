import { ArrowLeftRight, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/ui/button';

/** The right pane of the split view (F39): the item or research file beside the main one. */
export function SplitPane({
  onSwap,
  onClose,
  children,
}: {
  onSwap: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-label="Beside" className="grid min-w-0 content-start gap-3 border-l border-rule pl-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onSwap}>
          <ArrowLeftRight aria-hidden="true" className="size-4" />
          Swap panes
        </Button>
        <Button variant="ghost" onClick={onClose}>
          <X aria-hidden="true" className="size-4" />
          Close pane
        </Button>
      </div>
      {children}
    </section>
  );
}

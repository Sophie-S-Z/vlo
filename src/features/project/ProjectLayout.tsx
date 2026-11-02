import { PanelLeft, PanelRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { safeStorage } from '@/app/preferences';
import { useMediaQuery } from '@/app/useMediaQuery';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/ui/dialog';

const WIDTH_KEY = 'vlo:pageWidth';
export const MIN_WIDTH = 56;
export const MAX_WIDTH = 90;
const DEFAULT_WIDTH = 68;

function loadWidth(): number {
  const stored = Number(safeStorage()?.getItem(WIDTH_KEY));
  return stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
}

interface ProjectLayoutProps {
  title: ReactNode;
  binder: ReactNode;
  details: ReactNode;
  /** The manuscript column. Receives the chosen width in ch. */
  manuscript: (width: number) => ReactNode;
  binderOpen: boolean;
  onBinderOpen: (open: boolean) => void;
}

/** Binder, manuscript and details columns. Each side column collapses. Under 600 px the binder is a drawer. */
export function ProjectLayout({
  title,
  binder,
  details,
  manuscript,
  binderOpen,
  onBinderOpen,
}: ProjectLayoutProps) {
  const small = useMediaQuery('(max-width: 599px)');
  const [showBinder, setShowBinder] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [width, setWidth] = useState(loadWidth);
  const binderId = useId();
  const detailsId = useId();
  const widthId = useId();

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {title}
        <div className="flex flex-wrap items-center gap-2">
          {small ? (
            <Dialog open={binderOpen} onOpenChange={onBinderOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <PanelLeft aria-hidden="true" className="size-4" />
                  Binder
                </Button>
              </DialogTrigger>
              <DialogContent className="top-0 left-0 h-dvh max-h-dvh w-[min(22rem,calc(100vw-2rem))] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0">
                <DialogTitle className="sr-only">Binder</DialogTitle>
                <DialogDescription className="sr-only">
                  Pick an item to open, or reorder items.
                </DialogDescription>
                {binder}
              </DialogContent>
            </Dialog>
          ) : (
            <Button
              variant="outline"
              aria-expanded={showBinder}
              aria-controls={binderId}
              onClick={() => {
                setShowBinder(!showBinder);
              }}
            >
              <PanelLeft aria-hidden="true" className="size-4" />
              {showBinder ? 'Hide binder' : 'Show binder'}
            </Button>
          )}
          <Button
            variant="outline"
            aria-expanded={showDetails}
            aria-controls={detailsId}
            onClick={() => {
              setShowDetails(!showDetails);
            }}
          >
            <PanelRight aria-hidden="true" className="size-4" />
            {showDetails ? 'Hide details' : 'Show details'}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'grid gap-6',
          !small && showBinder && showDetails && 'grid-cols-[17rem_minmax(0,1fr)_16rem]',
          !small && showBinder && !showDetails && 'grid-cols-[17rem_minmax(0,1fr)]',
          !small && !showBinder && showDetails && 'grid-cols-[minmax(0,1fr)_16rem]',
        )}
      >
        {!small && showBinder && (
          <aside id={binderId} className="min-w-0">
            {binder}
          </aside>
        )}
        <div className="min-w-0">{manuscript(width)}</div>
        {showDetails && (
          <aside id={detailsId} aria-label="Details" className="grid content-start gap-6 min-w-0">
            {details}
            <div className="grid gap-2">
              <label htmlFor={widthId} className="text-sm font-medium">
                Page width: <span className="font-mono">{width} ch</span>
              </label>
              <input
                id={widthId}
                type="range"
                min={MIN_WIDTH}
                max={MAX_WIDTH}
                step={2}
                value={width}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setWidth(next);
                  try {
                    safeStorage()?.setItem(WIDTH_KEY, String(next));
                  } catch {
                    // Full or blocked storage: the width still applies to this visit.
                  }
                }}
                className="accent-[var(--accent)]"
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

import { Bot, Minimize2, PanelLeft, PanelRight } from 'lucide-react';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { safeStorage } from '@/app/preferences';
import { useMediaQuery } from '@/app/useMediaQuery';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { ICON_BUTTON } from '@/ui/tip';
import { Tips } from '@/features/onboarding/Tips';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/ui/dialog';

const WIDTH_KEY = 'vlo:pageWidth';
export const MIN_WIDTH = 56;
export const MAX_WIDTH = 90;
const DEFAULT_WIDTH = 68;

function loadWidth(): number {
  const stored = Number(safeStorage()?.getItem(WIDTH_KEY));
  return stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
}

interface ProjectLayoutProps {
  /**
   * The title and the view tabs. On a wide screen it gets the tool icons, so the tabs and the tools share one
   * row (Phase 17 decision S1).
   */
  title: (tools: ReactNode) => ReactNode;
  binder: ReactNode;
  details: ReactNode;
  /** The manuscript column. Receives the chosen width in ch. */
  manuscript: (width: number) => ReactNode;
  binderOpen: boolean;
  onBinderOpen: (open: boolean) => void;
  /** The session timer. It stays mounted in focus mode, so a running session keeps going. */
  timer: ReactNode;
  /** Search, focus and other tools. Hidden in focus mode. */
  tools: ReactNode;
  /** Focus mode shows only the manuscript. */
  focusMode: boolean;
  onLeaveFocus: () => void;
  /** The Assistant panel, outside Pen mode only. It takes the right column, or a bottom sheet on a phone. */
  assistant?: ReactNode;
  assistantOpen?: boolean;
  onAssistantOpen?: (open: boolean) => void;
  /** Runs as the phone sheet closes, so an Insert can send focus back to the text. */
  onSheetCloseAutoFocus?: (event: Event) => void;
}

/** Binder, manuscript and details columns. Each side column collapses. Under 600 px the binder is a drawer. */
export function ProjectLayout({
  title,
  binder,
  details,
  manuscript,
  binderOpen,
  onBinderOpen,
  timer,
  tools,
  focusMode,
  onLeaveFocus,
  assistant,
  assistantOpen = false,
  onAssistantOpen,
  onSheetCloseAutoFocus,
}: ProjectLayoutProps) {
  const small = useMediaQuery('(max-width: 599px)');
  const wide = useMediaQuery('(min-width: 1024px)');
  const [showBinder, setShowBinder] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [width, setWidth] = useState(loadWidth);
  const binderId = useId();
  const detailsId = useId();
  const widthId = useId();
  const assistantId = useId();
  // The right column holds the details or the Assistant, one at a time.
  const showAssistant = assistant !== undefined && assistantOpen && !focusMode;
  const right = !focusMode && !small && (showDetails || showAssistant);
  const rightWidth = showAssistant ? '22rem' : '16rem';

  // One quiet row of icon tools (Phase 17 decision S1): the binder first, then the rest. Each icon names
  // itself in a tooltip and keeps its name for the screen reader.
  const toolRow = (
    <div className="flex items-center gap-0.5 sm:gap-1">
      {focusMode ? null : small ? (
        <Dialog open={binderOpen} onOpenChange={onBinderOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className={ICON_BUTTON} data-tip="Binder" data-tip-align="start">
              <PanelLeft aria-hidden="true" className="size-4" />
              <span className="sr-only">Binder</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="top-0 left-0 h-dvh max-h-dvh w-[min(22rem,calc(100vw-2rem))] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0">
            <DialogTitle className="sr-only">Binder</DialogTitle>
            <DialogDescription className="sr-only">Pick an item to open, or reorder items.</DialogDescription>
            {binder}
          </DialogContent>
        </Dialog>
      ) : (
        <Button
          variant="ghost"
          className={ICON_BUTTON}
          data-tip={showBinder ? 'Hide binder' : 'Show binder'}
          data-tip-align="start"
          aria-expanded={showBinder}
          aria-controls={binderId}
          onClick={() => {
            setShowBinder(!showBinder);
          }}
        >
          <PanelLeft aria-hidden="true" className="size-4" />
          <span className="sr-only">{showBinder ? 'Hide binder' : 'Show binder'}</span>
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-0.5 sm:gap-1">
        {timer}
        {focusMode ? (
          <Button variant="ghost" aria-keyshortcuts="Escape" onClick={onLeaveFocus}>
            <Minimize2 aria-hidden="true" className="size-4" />
            Leave focus mode
          </Button>
        ) : (
          tools
        )}
        {!focusMode && assistant !== undefined && (
          <Button
            variant="ghost"
            className={ICON_BUTTON}
            data-tip={assistantOpen ? 'Hide the Assistant' : 'Assistant'}
            data-tip-align="end"
            aria-expanded={assistantOpen}
            aria-controls={small ? undefined : assistantId}
            onClick={() => {
              if (!assistantOpen) setShowDetails(false);
              onAssistantOpen?.(!assistantOpen);
            }}
          >
            <Bot aria-hidden="true" className="size-4" />
            <span className="sr-only">{assistantOpen ? 'Hide the Assistant' : 'Assistant'}</span>
          </Button>
        )}
        {!focusMode && (
          <Button
            variant="ghost"
            className={ICON_BUTTON}
            data-tip={showDetails ? 'Hide details' : 'Show details'}
            data-tip-align="end"
            aria-expanded={showDetails}
            aria-controls={detailsId}
            onClick={() => {
              if (!showDetails) onAssistantOpen?.(false);
              setShowDetails(!showDetails);
            }}
          >
            <PanelRight aria-hidden="true" className="size-4" />
            <span className="sr-only">{showDetails ? 'Hide details' : 'Show details'}</span>
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4">
      {/* On a wide screen the tools join the tab row. Elsewhere, and in focus mode, they take a row of their own. */}
      {!focusMode && title(wide ? toolRow : null)}
      {(focusMode || !wide) && toolRow}
      {!focusMode && <Tips />}
      <div
        className={cn(
          'grid gap-6',
          !focusMode && !small && showBinder && right && 'grid-cols-[17rem_minmax(0,1fr)_var(--vlo-right)]',
          !focusMode && !small && showBinder && !right && 'grid-cols-[17rem_minmax(0,1fr)]',
          !focusMode && !small && !showBinder && right && 'grid-cols-[minmax(0,1fr)_var(--vlo-right)]',
        )}
        style={{ '--vlo-right': rightWidth } as CSSProperties}
      >
        {!focusMode && !small && showBinder && (
          <aside id={binderId} className="min-w-0">
            {binder}
          </aside>
        )}
        <div className="min-w-0">{manuscript(width)}</div>
        {showAssistant && !small && (
          <aside id={assistantId} aria-label="Assistant" className="min-w-0">
            {assistant}
          </aside>
        )}
        {!focusMode && showDetails && !showAssistant && (
          <aside id={detailsId} aria-label="Details" className="grid content-start gap-6 min-w-0">
            {details}
            <div className="grid gap-2">
              <label htmlFor={widthId} className="text-sm font-medium">
                Page width: <span className="tabular-nums">{width} ch</span>
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
      {small && assistant !== undefined && (
        <Dialog open={showAssistant} onOpenChange={(open) => onAssistantOpen?.(open)}>
          <DialogContent
            className="top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none rounded-t-[var(--radius-card)] border-x-0 border-b-0"
            onCloseAutoFocus={onSheetCloseAutoFocus}
          >
            <DialogTitle className="sr-only">Assistant</DialogTitle>
            <DialogDescription className="sr-only">
              Ask the AI about your text. Answers stay in this sheet.
            </DialogDescription>
            {assistant}
            <DialogClose asChild>
              <Button variant="outline" className="justify-self-end">
                Close the Assistant
              </Button>
            </DialogClose>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

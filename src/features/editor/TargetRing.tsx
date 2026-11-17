import { Target } from 'lucide-react';
import { useId, useState } from 'react';
import { parseTarget, setItemTarget } from '@/features/binder/items';
import { MAX_ITEM_TARGET, type Item } from '@/lib/db';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { ICON_BUTTON } from '@/ui/tip';

/*
 * The word target of the open item (Phase 19, Task A4). With a target, a small ring next to the word count
 * fills as the writer writes, and it fills in full at the target with no sound and no motion. With none, a
 * quiet target button sets one. The count changes only after a typing pause, so the ring does too.
 */

const R = 7;
const CIRCLE = 2 * Math.PI * R;

/** The share of the target, from 0 to 1. */
export function targetShare(words: number, target: number): number {
  return Math.min(Math.max(words / target, 0), 1);
}

function Ring({ share }: { share: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-[18px] -rotate-90">
      <circle cx="9" cy="9" r={R} fill="none" stroke="var(--rule)" strokeWidth="2.5" />
      <circle
        cx="9"
        cy="9"
        r={R}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${String(share * CIRCLE)} ${String(CIRCLE)}`}
      />
    </svg>
  );
}

export function TargetRing({ item }: { item: Pick<Item, 'id' | 'title' | 'wordCount' | 'target'> }) {
  const fieldId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { target, wordCount } = item;
  const share = target === undefined ? 0 : targetShare(wordCount, target);
  const label =
    target === undefined
      ? 'Word target'
      : share >= 1
        ? `Word target met: ${wordCount.toLocaleString()} of ${target.toLocaleString()} words`
        : `Word target: ${wordCount.toLocaleString()} of ${target.toLocaleString()} words`;

  const save = async (next: number | null) => {
    try {
      await setItemTarget(item.id, next);
      setOpen(false);
    } catch {
      setError('Vlo could not save the target on this device.');
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(target === undefined ? '' : String(target));
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={target === undefined ? ICON_BUTTON : `${ICON_BUTTON} gap-1.5 px-1.5`}
          aria-label={label}
          data-tool="target"
          data-tip={
            target === undefined ? 'Word target' : `${String(Math.floor(share * 100))}% of the target`
          }
        >
          {target === undefined ? <Target aria-hidden="true" className="size-4" /> : <Ring share={share} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Word target" className="grid gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const next = parseTarget(value);
            if (Number.isNaN(next)) {
              setError(`Type a whole number from 1 to ${MAX_ITEM_TARGET.toLocaleString()}.`);
              return;
            }
            void save(next);
          }}
          className="grid gap-2"
        >
          <label htmlFor={fieldId} className="text-sm font-medium">
            Word target for {item.title}
          </label>
          <div className="flex gap-2">
            <Input
              id={fieldId}
              value={value}
              inputMode="numeric"
              autoComplete="off"
              placeholder="2,000"
              aria-invalid={error !== null}
              aria-describedby={error === null ? undefined : errorId}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              className="min-w-0 flex-1"
            />
            <Button type="submit">Set</Button>
          </div>
          {error !== null && (
            <p id={errorId} role="alert" className="text-sm text-accent-text">
              {error}
            </p>
          )}
        </form>
        {target !== undefined && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted tabular-nums">
              {wordCount.toLocaleString()} of {target.toLocaleString()} words
            </p>
            <Button
              variant="ghost"
              className="px-2 pointer-fine:min-h-8"
              onClick={() => {
                void save(null);
              }}
            >
              Remove target
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

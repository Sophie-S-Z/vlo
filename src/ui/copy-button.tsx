import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './button';
import { cn } from './cn';
import { SwapIcon } from './swap-icon';

/** How long "Copied" shows before the button reads "Copy link" again. */
const SHOW_COPIED_MS = 2000;

/** A button that copies a link, and says in a status whether the browser copied it. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state !== 'copied') return;
    const timer = window.setTimeout(() => {
      setState('idle');
    }, SHOW_COPIED_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-label={label}
        className={cn(state === 'copied' && 'vlo-pulse')}
        onClick={() => {
          void copy();
        }}
      >
        <SwapIcon
          on={state === 'copied'}
          off={<Copy className="size-4" />}
          onIcon={<Check className="size-4" />}
        />
        {state === 'copied' ? 'Copied' : 'Copy link'}
      </Button>
      <span role="status" className="sr-only">
        {state === 'copied'
          ? 'Link copied.'
          : state === 'failed'
            ? 'This browser did not copy the link.'
            : ''}
      </span>
    </>
  );
}

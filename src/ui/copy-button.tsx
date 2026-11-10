import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './button';
import { cn } from './cn';
import { SwapIcon } from './swap-icon';

/** How long "Copied" shows before the button reads as it did. */
const SHOW_COPIED_MS = 2000;

interface CopyButtonProps {
  /** The button's name for screen readers. */
  label: string;
  /** The text to copy. */
  text: string;
  /** Rich text to copy beside `text`, for an editor that takes HTML (F52). */
  html?: string;
  /** What the button says. "Copy link" by default. */
  children?: string;
  /** What the status says after a copy. "Link copied." by default. */
  copied?: string;
}

/** A button that copies text, and says in a status whether the browser copied it. A copy pulses once. */
export function CopyButton({
  label,
  text,
  html,
  children = 'Copy link',
  copied = 'Link copied.',
}: CopyButtonProps) {
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
      if (html === undefined) await navigator.clipboard.writeText(text);
      else
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
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
        {state === 'copied' ? 'Copied' : children}
      </Button>
      <span role="status" className="sr-only">
        {state === 'copied' ? copied : state === 'failed' ? 'This browser did not copy it.' : ''}
      </span>
    </>
  );
}

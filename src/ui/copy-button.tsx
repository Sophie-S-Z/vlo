import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from './button';

/** A button that copies a link, and says in a status whether the browser copied it. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
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
        onClick={() => {
          void copy();
        }}
      >
        {state === 'copied' ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
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

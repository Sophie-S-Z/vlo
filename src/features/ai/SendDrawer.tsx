import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/ui/button';
import { estimateTokens } from './engine/types';
import type { AiRequest } from './reader';

/*
 * "What will be sent" (spec section 10, trust rules). Before each request the drawer shows the exact text,
 * the host and an estimated token count. The writer can turn it off after the first time.
 */

const numbers = new Intl.NumberFormat();

/** The request as the writer reads it: the instructions, then each message. */
export function requestText(request: AiRequest): string {
  return [
    `Instructions:\n${request.system}`,
    ...request.messages.map((m) => `${m.role === 'user' ? 'You' : 'Assistant'}:\n${m.content}`),
  ].join('\n\n');
}

export function SendDrawer({
  request,
  host,
  aliased,
  onSend,
  onCancel,
}: {
  request: AiRequest;
  host: string;
  /** True when a memoir request carries aliases. */
  aliased: boolean;
  onSend: (hideNextTime: boolean) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [hide, setHide] = useState(false);
  const sendRef = useRef<HTMLButtonElement>(null);
  const text = requestText(request);
  const tokens = estimateTokens(text) + request.maxTokens;
  const local = host === 'this browser';

  const sectionRef = useRef<HTMLElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  });

  useEffect(() => {
    sendRef.current?.focus();
    // Escape in the drawer cancels the request, and goes no further.
    const section = sectionRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      cancel.current();
    };
    section?.addEventListener('keydown', onKey);
    return () => section?.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-labelledby={`${id}-title`}
      data-testid="send-drawer"
      className="vlo-drawer grid gap-3 rounded-[var(--radius-card)] border border-accent bg-surface p-3"
    >
      <h3 id={`${id}-title`} className="font-display text-lg font-semibold">
        What will be sent
      </h3>
      <p className="text-sm">
        {local ? (
          <>This request stays in this browser. The model runs on this device.</>
        ) : (
          <>
            To <strong className="font-mono text-xs">{host}</strong>, about {numbers.format(tokens)} tokens
            with the answer.
          </>
        )}
        {aliased && ' Real names go as their aliases.'}
      </p>
      {/* The text can be long, so a keyboard user can focus it and scroll it. */}
      <pre
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label="The exact text"
        className="max-h-64 overflow-auto rounded-md border border-rule bg-bg p-2 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]"
      >
        {text}
      </pre>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hide}
          onChange={(event) => {
            setHide(event.target.checked);
          }}
          className="size-5 accent-[var(--accent)]"
        />
        Do not show this again
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          ref={sendRef}
          onClick={() => {
            onSend(hide);
          }}
        >
          Send
        </Button>
      </div>
    </section>
  );
}

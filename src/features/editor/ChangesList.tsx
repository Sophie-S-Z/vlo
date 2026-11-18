import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useId } from 'react';
import type { Pass } from '@/lib/db';
import { Button } from '@/ui/button';
import { focusText } from './commands/editorBus';
import { changeLabel, changesOf, selectChange } from './extensions/suggestion';
import { shortQuote } from './ThreadCard';
import { PASSES, saveTracking, useTracking } from './trackingStore';

/**
 * Track changes for the open item, under the text (F44, decision R1): the switch's pass, and each waiting
 * change in text order with Accept and Reject. It shows while tracking is on or a change waits. When the
 * review margin shows the changes as cards (Phase 19, Task C2), the list keeps only its tools.
 */
export function ChangesList({ editor, inMargin }: { editor: Editor; inMargin: boolean }) {
  const headingId = useId();
  const passId = useId();
  const tracking = useTracking();
  const changes = useEditorState({
    editor,
    selector: ({ editor: e }) => changesOf(e.state),
  });
  if (!tracking.on && changes.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="border-t border-rule pt-4" data-vlo-changes="">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id={headingId} className="text-sm font-medium text-muted">
          {tracking.on ? 'Track changes is on' : 'Changes'}
        </h2>
        {tracking.on && (
          <label htmlFor={passId} className="flex items-center gap-2 text-sm">
            Pass
            <select
              id={passId}
              value={tracking.pass}
              onChange={(event) => {
                void saveTracking({ pass: Number(event.target.value) as Pass }).catch(() => undefined);
              }}
              className="min-h-11 rounded-md border border-rule bg-bg px-2"
            >
              {PASSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <span className="vlo-pass-swatch" data-pass={tracking.pass} aria-hidden="true" />
          </label>
        )}
        {changes.length > 0 && (
          <div className="flex gap-1">
            <Button variant="ghost" onClick={() => editor.commands.acceptAll()}>
              Accept all
            </Button>
            <Button variant="ghost" onClick={() => editor.commands.rejectAll()}>
              Reject all
            </Button>
          </div>
        )}
      </div>
      {changes.length === 0 ? (
        <p className="text-sm text-muted">
          New words and deleted words show here until you accept or reject them.
        </p>
      ) : inMargin ? (
        <p className="text-sm text-muted">Each change has a card in the margin, beside its words.</p>
      ) : (
        <ul className="grid gap-1">
          {changes.map((change) => {
            const quote = shortQuote(change.text);
            return (
              <li key={change.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => {
                    selectChange(editor, change);
                    focusText(editor);
                  }}
                  className="min-h-11 flex-1 rounded-md px-2 py-1 text-left text-sm hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex items-center gap-2 text-muted">
                    <span className="vlo-pass-swatch" data-pass={change.pass} aria-hidden="true" />
                    {changeLabel(change)}, pass {change.pass}
                  </span>
                  <span className="block [overflow-wrap:anywhere]">“{quote}”</span>
                </button>
                <Button
                  variant="ghost"
                  className="shrink-0"
                  aria-label={`Accept: ${changeLabel(change)} “${quote}”`}
                  onClick={() => {
                    editor.commands.acceptChange(change.id);
                  }}
                >
                  Accept
                </Button>
                <Button
                  variant="ghost"
                  className="shrink-0"
                  aria-label={`Reject: ${changeLabel(change)} “${quote}”`}
                  onClick={() => {
                    editor.commands.rejectChange(change.id);
                  }}
                >
                  Reject
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

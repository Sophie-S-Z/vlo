import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { useId } from 'react';
import type { Pass } from '@/lib/db';
import { Button } from '@/ui/button';
import { focusText } from './commands/editorBus';
import { changesOf, type ChangeEntry } from './extensions/suggestion';
import { PASSES, saveTracking, useTracking } from './trackingStore';

/** The longest quote of a change's words in the list. */
const QUOTE_CHARS = 60;

function shortQuote(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > QUOTE_CHARS ? `${clean.slice(0, QUOTE_CHARS - 1).trimEnd()}…` : clean;
}

const what = (change: Pick<ChangeEntry, 'kind' | 'by'>) =>
  `${change.kind === 'insert' ? 'Inserted' : 'Deleted'}${change.by ? ` by ${change.by}` : ''}`;

function select(editor: Editor, change: ChangeEntry): void {
  const { doc } = editor.state;
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(doc, change.from, change.to)).scrollIntoView(),
  );
  focusText(editor);
}

/**
 * Track changes for the open item, under the text (F44, decision R1): the switch's pass, and each waiting
 * change in text order with Accept and Reject. It shows while tracking is on or a change waits.
 */
export function ChangesList({ editor }: { editor: Editor }) {
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
      ) : (
        <ul className="grid gap-1">
          {changes.map((change) => {
            const quote = shortQuote(change.text);
            return (
              <li key={change.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => {
                    select(editor, change);
                  }}
                  className="min-h-11 flex-1 rounded-md px-2 py-1 text-left text-sm hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex items-center gap-2 text-muted">
                    <span className="vlo-pass-swatch" data-pass={change.pass} aria-hidden="true" />
                    {what(change)}, pass {change.pass}
                  </span>
                  <span className="block [overflow-wrap:anywhere]">“{quote}”</span>
                </button>
                <Button
                  variant="ghost"
                  className="shrink-0"
                  aria-label={`Accept: ${what(change)} “${quote}”`}
                  onClick={() => {
                    editor.commands.acceptChange(change.id);
                  }}
                >
                  Accept
                </Button>
                <Button
                  variant="ghost"
                  className="shrink-0"
                  aria-label={`Reject: ${what(change)} “${quote}”`}
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

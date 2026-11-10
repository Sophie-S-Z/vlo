import type { Editor } from '@tiptap/react';
import { useId, useMemo } from 'react';
import { setPoemForm } from './craftStore';
import { checkForm, isPoemForm, POEM_FORMS, type PoemForm } from './forms';
import type { LineScan } from './scan';

/*
 * The form check of a poem (roadmap F56, plan Task K1). It sits with the Craft labels and reads their
 * scan, so it costs no second scan. Each note moves the cursor to its line.
 */

export interface FormCheckProps {
  editor: Editor;
  itemId: string;
  form: PoemForm | undefined;
  /** The text of each scanned line, stanza by stanza. */
  stanzas: readonly (readonly string[])[];
  /** The scan of each line, or null in a language that the scan does not read. */
  scans: readonly LineScan[] | null;
  /** The position where each line's text starts, in the order of the scan. */
  starts: readonly number[];
}

export function FormCheck({ editor, itemId, form, stanzas, scans, starts }: FormCheckProps) {
  const selectId = useId();
  const notes = useMemo(() => (form ? checkForm(form, stanzas, scans) : []), [form, stanzas, scans]);
  const name = POEM_FORMS.find((f) => f.id === form)?.name;

  const show = (line: number | null) => {
    const pos = line === null ? undefined : starts[line];
    if (pos === undefined) return;
    editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
  };

  return (
    <div className="vlo-craft-form mb-3 grid gap-2 text-sm">
      <label htmlFor={selectId} className="flex flex-wrap items-center gap-2">
        Form
        <select
          id={selectId}
          value={form ?? ''}
          onChange={(event) => {
            const next = event.target.value;
            void setPoemForm(itemId, isPoemForm(next) ? next : null).catch(() => undefined);
          }}
          className="min-h-11 rounded-md border border-rule bg-bg px-2"
        >
          <option value="">None</option>
          {POEM_FORMS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      {form && (
        <div role="status">
          {notes.length === 0 ? (
            <p className="text-muted">The poem fits the {name?.toLowerCase()} form.</p>
          ) : (
            <ul aria-label={`${name ?? ''} notes`} className="grid gap-1">
              {notes.map((note, index) => (
                <li key={`${String(index)}-${note.message}`}>
                  {note.line === null ? (
                    note.message
                  ) : (
                    <button
                      type="button"
                      className="min-h-11 text-start underline decoration-rule underline-offset-4 hover:decoration-accent sm:min-h-0"
                      onClick={() => {
                        show(note.line);
                      }}
                    >
                      {note.message}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!scans && <p className="text-muted">Rhyme and syllables are checked in English only.</p>}
        </div>
      )}
    </div>
  );
}

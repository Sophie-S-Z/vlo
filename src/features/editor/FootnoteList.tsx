import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useId, type ReactNode } from 'react';
import { openPanel } from './commands/editorBus';
import { footnotesOf, selectFootnote } from './extensions/footnote';
import type { NoteContent, NoteMark } from './format/notes';

const MARK_TAGS: Readonly<Record<NoteMark, 'strong' | 'em' | 'u' | 's' | 'sup' | 'sub'>> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  superscript: 'sup',
  subscript: 'sub',
};

/** The note with its styles, built from checked data only. */
function NoteBody({ content }: { content: NoteContent }) {
  return (
    <>
      {content.map((run, i) => {
        let body: ReactNode = run.text;
        for (const mark of [...(run.marks ?? [])].reverse()) {
          const Tag = MARK_TAGS[mark.type];
          body = <Tag>{body}</Tag>;
        }
        return <span key={i}>{body}</span>;
      })}
    </>
  );
}

interface ListedNote {
  number: number;
  content: NoteContent;
}

/**
 * The notes of the open item, in document order, under the text. Pressing a note selects its reference
 * and opens it for editing. The list re-renders only when a number or a note changes.
 */
export function FootnoteList({ editor }: { editor: Editor }) {
  const headingId = useId();
  const notes = useEditorState({
    editor,
    selector: ({ editor: e }): ListedNote[] =>
      footnotesOf(e.state).map(({ number, content }) => ({ number, content })),
  });
  if (notes.length === 0) return null;

  const edit = (number: number) => {
    const entry = footnotesOf(editor.state).find((e) => e.number === number);
    if (!entry || !selectFootnote(editor, entry.pos)) return;
    openPanel({ editor, panel: 'footnote', anchor: 'caret' });
  };

  return (
    <section aria-labelledby={headingId} className="mt-2 border-t border-rule pt-4" data-vlo-notes="">
      <h2 id={headingId} className="mb-2 text-sm font-medium text-muted">
        Notes
      </h2>
      <ol className="grid gap-1">
        {notes.map((note) => (
          <li key={note.number} className="flex items-baseline gap-2">
            <span aria-hidden="true" className="w-6 shrink-0 text-right tabular-nums text-xs text-muted">
              {note.number}
            </span>
            <button
              type="button"
              onClick={() => {
                edit(note.number);
              }}
              className="min-h-11 flex-1 rounded-md px-2 py-1 text-left font-manuscript text-base text-text hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent pointer-fine:min-h-8"
            >
              <span className="sr-only">{`Edit footnote ${String(note.number)}: `}</span>
              {note.content.length > 0 ? (
                <NoteBody content={note.content} />
              ) : (
                <span className="text-muted">Empty note</span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

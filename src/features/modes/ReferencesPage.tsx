import { useLiveQuery } from 'dexie-react-hooks';
import { BookMarked, FileUp } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { addSources, readSourceFile, useSources } from '@/features/cite/sources';
import { ReferenceEntry } from '@/features/cite/ReferenceEntry';
import {
  CITE_STYLE_LABELS,
  entryHtml,
  entryText,
  listTitle,
  reference,
  sortReferences,
} from '@/features/cite/styles';
import { updateProjectSettings } from '@/features/library/projects';
import { CITE_STYLES, db, type CiteStyle } from '@/lib/db';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';

/*
 * The References page (Phase 17 decision M3): the project's sources as a live reference list in the
 * project's style. The writer cites in the text with "/" and Cite a source. An export puts the list of the
 * cited sources here, or every source when the text cites none.
 */

export function ReferencesPage({
  projectId,
  language,
  title,
}: {
  projectId: string;
  language: string;
  /** The item's title. The list title shows only when it differs, such as Works Cited on a page named References. */
  title: string;
}) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const sources = useSources(projectId);
  const style: CiteStyle = project?.settings.citeStyle ?? 'apa';
  const [message, setMessage] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const styleId = useId();
  const sorted = sources ? sortReferences(sources, language) : [];
  const entries = sorted.map((s) => ({ id: s.id, runs: reference(s, style) }));
  const heading = listTitle(style, title);

  return (
    <section aria-label={heading} className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {heading === title.trim() ? (
          <span />
        ) : (
          <h3 className="font-display text-xl font-semibold">{heading}</h3>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={styleId} className="text-sm text-muted">
            Style
          </label>
          <select
            id={styleId}
            value={style}
            onChange={(event) => {
              void updateProjectSettings(projectId, { citeStyle: event.target.value as CiteStyle });
            }}
            className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9"
          >
            {CITE_STYLES.map((s) => (
              <option key={s} value={s}>
                {CITE_STYLE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-sm text-muted">
        To cite a source in a section, type / and choose Cite a source. An export puts the sources that you
        cite here, in {CITE_STYLE_LABELS[style]} order. When the text cites none, it lists every source.
      </p>
      {sources === undefined ? (
        <p className="text-sm text-muted">Loading the sources.</p>
      ) : entries.length === 0 ? (
        <div className="grid justify-items-start gap-2 rounded-[var(--radius-card)] border border-dashed border-rule p-4 text-sm">
          <BookMarked aria-hidden="true" className="size-5 text-accent-text" />
          <p>No sources yet. Add one with Cite a source, or import a file from Zotero.</p>
        </div>
      ) : (
        <ol className="grid gap-3 font-manuscript text-base" aria-label="Sources">
          {entries.map((entry) => (
            <li key={entry.id} className="pl-8 -indent-8">
              <ReferenceEntry runs={entry.runs} />
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={file}
          type="file"
          accept=".bib,.json,.bibtex,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = '';
            if (!picked) return;
            void (async () => {
              try {
                const added = await addSources(projectId, readSourceFile(picked.name, await picked.text()));
                setMessage(
                  added.length === 1 ? 'Vlo added 1 source.' : `Vlo added ${String(added.length)} sources.`,
                );
              } catch (error) {
                setMessage(
                  error instanceof Error && error.message
                    ? error.message
                    : 'Vlo could not read this file. Pick a BibTeX or CSL JSON file.',
                );
              }
            })();
          }}
        />
        <Button
          variant="outline"
          onClick={() => {
            file.current?.click();
          }}
        >
          <FileUp aria-hidden="true" className="size-4" />
          Import BibTeX or CSL JSON
        </Button>
        {entries.length > 0 && (
          <CopyButton
            label="Copy the reference list"
            text={entries.map((e) => entryText(e.runs)).join('\n')}
            html={entries.map((e) => `<p>${entryHtml(e.runs)}</p>`).join('')}
            copied="Reference list copied."
          >
            Copy the list
          </CopyButton>
        )}
      </div>
      <p role="status" className="text-sm text-muted">
        {message}
      </p>
    </section>
  );
}

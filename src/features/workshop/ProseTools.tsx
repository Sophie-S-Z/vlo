import { X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useSources } from '@/features/cite/sources';
import { CITE_STYLE_LABELS, reference, sortReferences } from '@/features/cite/styles';
import { projectDef } from '@/features/library/templates';
import { renameProject } from '@/features/library/projects';
import type { Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { citationCounts } from './citations';
import { checkHeadline, spine } from './prose';
import type { TextItem } from './WorkshopPage';

/* The prose tools of the Workshop (Phase 17 decision D1). The logic is in prose.ts and citations.ts. */

/** The sections of an essay, an article or a paper: its pages, without a references page. */
function sectionsOf(project: Project, texts: TextItem[]): TextItem[] {
  const def = projectDef(project);
  return texts.filter((t) => def.editorKind(t.item.kind) === 'prose');
}

export function SpineTool({ project, texts }: { project: Project; texts: TextItem[] }) {
  const language = project.settings.language;
  const sections = useMemo(
    () =>
      spine(
        sectionsOf(project, texts).map((t) => ({ id: t.item.id, title: t.item.title, text: t.text })),
        language,
      ),
    [project, texts, language],
  );
  const points = sections.reduce((n, s) => n + s.points.length, 0);
  if (points === 0)
    return (
      <p className="max-w-prose text-muted">
        The spine shows when a section has a paragraph. Write a paragraph, then come back.
      </p>
    );
  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-sm text-muted">
        Read the list from the top. If a sentence does not follow from the one before it, the paragraph may
        need a new first sentence, or it may belong in another place. A section with no paragraph shows as
        empty.
      </p>
      {sections.map((section) => (
        <section key={section.id} aria-label={section.title} className="grid gap-2">
          <h3 className="font-display text-lg font-semibold">
            <Link
              to={`/p/${project.id}?item=${section.id}`}
              className="hover:text-accent-text hover:underline"
            >
              {section.title}
            </Link>
          </h3>
          {section.points.length === 0 ? (
            <p className="text-sm text-muted">No paragraph yet.</p>
          ) : (
            <ol className="grid max-w-prose list-decimal gap-1.5 pl-6 font-manuscript text-base">
              {section.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

const headlineKey = (projectId: string) => `vlo:headlines:${projectId}`;

function readHeadlines(projectId: string): string[] {
  try {
    const raw = localStorage.getItem(headlineKey(projectId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((h): h is string => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

function writeHeadlines(projectId: string, list: string[]): void {
  try {
    localStorage.setItem(headlineKey(projectId), JSON.stringify(list));
  } catch {
    // The list stays for this visit only.
  }
}

export function HeadlineTool({ project }: { project: Project }) {
  const ids = useId();
  const [list, setList] = useState(() => readHeadlines(project.id));
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const save = (next: string[]) => {
    setList(next);
    writeHeadlines(project.id, next);
  };
  const add = () => {
    const text = draft.replace(/\s+/g, ' ').trim();
    if (text === '') return;
    if (!list.includes(text)) save([...list, text]);
    setDraft('');
    setMessage('');
  };
  return (
    <div className="grid gap-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <div className="grid min-w-60 flex-1 gap-2 sm:max-w-xl">
          <Label htmlFor={`${ids}-new`}>Headline idea</Label>
          <Input
            id={`${ids}-new`}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="outline" disabled={draft.trim() === ''}>
          Add the idea
        </Button>
      </form>
      <p className="max-w-prose text-sm text-muted">
        Write ten ideas or more before you choose. The ideas stay on this device and do not go into the
        project file.
      </p>
      {list.length > 0 && (
        <ul className="grid gap-2" aria-label="Headline ideas">
          {list.map((headline) => {
            const check = checkHeadline(headline);
            const current = headline === project.title;
            return (
              <li
                key={headline}
                className="grid gap-2 rounded-[var(--radius-card)] border border-rule p-3 sm:grid-cols-[1fr_auto] sm:items-start"
              >
                <div className="grid gap-1">
                  <p className="font-display text-lg [overflow-wrap:anywhere]">{headline}</p>
                  <p className="text-sm text-muted">
                    {check.characters} characters, {check.words} {check.words === 1 ? 'word' : 'words'}
                    {current ? '. This is the title now.' : ''}
                  </p>
                  {check.notes.map((note) => (
                    <p key={note} className="text-sm text-accent-text">
                      {note}
                    </p>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {!current && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void renameProject(project.id, headline).then(
                          () => {
                            setMessage(`The title is now “${headline}”.`);
                          },
                          () => {
                            setMessage('Vlo could not change the title. Try again.');
                          },
                        );
                      }}
                    >
                      Use as the title
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-w-11 px-0"
                    aria-label={`Remove “${headline}”`}
                    onClick={() => {
                      save(list.filter((h) => h !== headline));
                    }}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}

/**
 * The citation counts of the sections. The documents live in their own databases, outside a live query,
 * so the counts read them again each time the list of sections or their text changes.
 */
function useCitationCounts(sectionIds: string[]): Map<string, number> | undefined {
  const [counts, setCounts] = useState<Map<string, number>>();
  useEffect(() => {
    const run = { live: true };
    void citationCounts(sectionIds).then(
      (next) => {
        if (run.live) setCounts(next);
      },
      () => {
        if (run.live) setCounts(new Map());
      },
    );
    return () => {
      run.live = false;
    };
  }, [sectionIds]);
  return counts;
}

export function CitationTool({ project, texts }: { project: Project; texts: TextItem[] }) {
  const sources = useSources(project.id);
  const style = project.settings.citeStyle ?? 'apa';
  const sectionIds = useMemo(() => sectionsOf(project, texts).map((t) => t.item.id), [project, texts]);
  const counts = useCitationCounts(sectionIds);
  if (sources === undefined || counts === undefined)
    return <p className="text-muted">Loading the sources.</p>;
  if (sources.length === 0 && counts.size === 0)
    return (
      <p className="max-w-prose text-muted">
        This paper has no sources yet. To add one, type / in a section and choose Cite a source.
      </p>
    );
  const sorted = sortReferences(sources, project.settings.language ?? 'en');
  const cited = sorted.filter((s) => (counts.get(s.key) ?? 0) > 0);
  const uncited = sorted.filter((s) => (counts.get(s.key) ?? 0) === 0);
  const keys = new Set(sources.map((s) => s.key));
  const lost = [...counts].filter(([key]) => !keys.has(key));
  const entry = (source: (typeof sources)[number]) =>
    reference(source, style).map((run, i) =>
      run.type !== 'text' ? null : run.style.italic ? (
        <i key={i}>{run.text}</i>
      ) : (
        <span key={i}>{run.text}</span>
      ),
    );
  return (
    <div className="grid gap-6">
      <p role="status">
        {cited.length} of {sources.length} {sources.length === 1 ? 'source' : 'sources'} cited.
        {uncited.length > 0 &&
          cited.length > 0 &&
          ` An export leaves the ${String(uncited.length)} that the text does not cite out of the ${CITE_STYLE_LABELS[style]} list.`}
      </p>
      {lost.length > 0 && (
        <section aria-label="Citations of deleted sources" className="grid gap-2">
          <h3 className="font-display text-lg font-semibold">Citations of deleted sources</h3>
          <p className="max-w-prose text-sm text-muted">
            The text cites these keys, but their sources are gone. An export shows them as a missing source.
          </p>
          <ul className="grid gap-1 font-mono text-sm">
            {lost.map(([key, n]) => (
              <li key={key}>
                {key}, {n} {n === 1 ? 'time' : 'times'}
              </li>
            ))}
          </ul>
        </section>
      )}
      {uncited.length > 0 && (
        <section aria-label="Not cited" className="grid gap-2">
          <h3 className="font-display text-lg font-semibold">Not cited</h3>
          <p className="max-w-prose text-sm text-muted">Cite each one in the text, or delete it.</p>
          <ul className="grid gap-2 font-manuscript text-base">
            {uncited.map((s) => (
              <li key={s.id} className="pl-8 -indent-8">
                {entry(s)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {cited.length > 0 && (
        <section aria-label="Cited" className="grid gap-2">
          <h3 className="font-display text-lg font-semibold">Cited</h3>
          <ul className="grid gap-2 font-manuscript text-base">
            {cited.map((s) => {
              const n = counts.get(s.key) ?? 0;
              return (
                <li key={s.id} className="grid gap-0.5">
                  <span className="pl-8 -indent-8">{entry(s)}</span>
                  <span className="pl-8 font-sans text-sm text-muted">
                    Cited {n} {n === 1 ? 'time' : 'times'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

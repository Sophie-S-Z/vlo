import type { Editor } from '@tiptap/core';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/ui/button';
import { showWordsOnOpen } from '../commands/editorBus';
import type { FindQuery } from '../extensions/findReplace';
import { findInProject, replaceInProject, type ProjectHit } from '../projectFind';

/*
 * The whole-project part of the find bar (Phase 19, Task B4): each item with matches, its count and a few
 * lines of context. A press opens the item at the match. Replace all in project asks first, with the
 * count, and keeps a snapshot of each item that it changes.
 */

/** The list searches again after this pause in typing. */
const SEARCH_MS = 250;

interface ProjectFindProps {
  editor: Editor;
  /** The item in this editor. */
  itemId: string;
  projectId: string;
  language: string | undefined;
  query: FindQuery;
  replacement: string;
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

export function ProjectFind({ editor, itemId, projectId, language, query, replacement }: ProjectFindProps) {
  const navigate = useNavigate();
  const [hits, setHits] = useState<readonly ProjectHit[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // A new search, or the end of a replace, lists the matches again.
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void findInProject(projectId, query).then((found) => {
        if (!cancelled) setHits(found);
      });
    }, SEARCH_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectId, query, round]);

  const total = (hits ?? []).reduce((sum, hit) => sum + hit.count, 0);
  const summary = `${plural(total, 'match', 'matches')} in ${plural(hits?.length ?? 0, 'item', 'items')}`;

  const replace = () => {
    if (!hits) return;
    setBusy(true);
    replaceInProject(hits, query, replacement, language, { editor, itemId }).then(
      (done) => {
        setMessage(
          `Replaced ${plural(done.matches, 'match', 'matches')} in ${plural(done.items, 'item', 'items')}. History keeps a snapshot of each item from before.`,
        );
        setAsking(false);
        setBusy(false);
        setRound((n) => n + 1);
      },
      () => {
        setMessage('Vlo could not replace in every item. History keeps a snapshot of each changed item.');
        setBusy(false);
        setRound((n) => n + 1);
      },
    );
  };

  return (
    <div className="grid gap-2 px-1">
      {query.text !== '' && hits !== null && (
        <p role="status" className="text-xs text-muted">
          {hits.length === 0 ? 'No matches in the project.' : summary}
        </p>
      )}
      {hits !== null && hits.length > 0 && (
        <ol className="grid max-h-64 gap-1 overflow-y-auto" aria-label="Matches in the project">
          {hits.map((hit) => (
            <li key={hit.item.id}>
              <button
                type="button"
                className="grid w-full gap-0.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => {
                  const first = hit.lines[0];
                  if (first) showWordsOnOpen(hit.item.id, first.match, first.block);
                  void navigate(`/p/${projectId}?${new URLSearchParams({ item: hit.item.id }).toString()}`);
                }}
              >
                <span className="flex justify-between gap-2 font-medium">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{hit.item.title}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{hit.count}</span>
                </span>
                {hit.lines.map((line, i) => (
                  <span key={i} className="text-xs text-muted [overflow-wrap:anywhere]">
                    {line.before}
                    <mark className="rounded-sm bg-accent/20 text-text">{line.match}</mark>
                    {line.after}
                  </span>
                ))}
              </button>
            </li>
          ))}
        </ol>
      )}
      {hits !== null && hits.length > 0 && !asking && (
        <div>
          <Button
            variant="outline"
            className="min-h-9 px-3 pointer-coarse:min-h-11"
            onClick={() => {
              setMessage('');
              setAsking(true);
            }}
          >
            Replace all in project
          </Button>
        </div>
      )}
      {asking && (
        <div
          role="group"
          aria-label="Replace all in project"
          className="grid gap-2 rounded-md border border-rule p-2"
        >
          <p className="text-sm">
            Replace {summary}
            {replacement === '' ? ' with nothing' : ` with “${replacement}”`}? Vlo keeps a snapshot of each
            item first.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-9 px-3" disabled={busy} onClick={replace}>
              {busy ? 'Replacing…' : `Replace ${plural(total, 'match', 'matches')}`}
            </Button>
            <Button
              variant="ghost"
              className="min-h-9 px-3"
              disabled={busy}
              onClick={() => {
                setAsking(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      <p role="status" className={message === '' ? 'sr-only' : 'text-xs text-muted'}>
        {message}
      </p>
    </div>
  );
}

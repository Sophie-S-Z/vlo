import { useLiveQuery } from 'dexie-react-hooks';
import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { showWordsOnOpen } from '@/features/editor/commands/editorBus';
import { projectDef } from '@/features/library/templates';
import { useProject } from '@/features/project/useProject';
import { ProjectMissing } from '@/features/project/ViewNotices';
import { ViewTabs } from '@/features/project/ViewTabs';
import { REACTION_LABELS, REACTIONS, refreshComments, type Reaction } from '@/features/share/comments';
import { sharingReady } from '@/features/share/rpc';
import { shareState } from '@/features/share/state';
import { db, type Item, type Project, type ShareRecord } from '@/lib/db';
import { Button } from '@/ui/button';
import { feedbackOf, makeComment, type FeedbackReply, type MadeComment } from './feedback';

/*
 * The Feedback tab (F50, decision R4): the replies of every link of the project, by item in binder order,
 * and the answers to the links' questions last. The writer can show a reply's words in the text, or put
 * the reply on them as a comment with the reader's name.
 */

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const MADE: Record<MadeComment, string> = {
  made: 'The reply is a comment on its words now.',
  missing: 'The words of the reply are not in this text now.',
  taken: 'These words have a comment already.',
  newer: 'A newer Vlo saved this item. Update Vlo on this device first.',
};

/** Reads the replies of each link that the server still serves. Gives how many links failed. */
async function readReplies(shares: readonly ShareRecord[]): Promise<number> {
  const results = await Promise.allSettled(
    shares.filter((s) => shareState(s) !== 'revoked').map((s) => refreshComments(s)),
  );
  return results.filter((r) => r.status === 'rejected').length;
}

const failedText = (failed: number) =>
  failed === 0
    ? ''
    : `Vlo could not read the replies of ${failed === 1 ? '1 link' : `${String(failed)} links`}.`;

function Reply({ reply, project, item }: { reply: FeedbackReply; project: Project; item: Item | undefined }) {
  const navigate = useNavigate();
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const { share, comment } = reply;
  const form = item ? projectDef(project).editorKind(item.kind) : null;
  const onWords = item !== undefined && form !== null && comment.quote !== '';

  return (
    <li className="grid gap-1 rounded-[var(--radius-card)] border border-rule bg-surface px-4 py-3 text-sm">
      {comment.question !== undefined ? (
        <span className="text-muted italic [overflow-wrap:anywhere]">
          Answer to “{share.questions?.[comment.question] ?? ''}”
        </span>
      ) : (
        comment.quote !== '' && (
          <span className="text-muted italic [overflow-wrap:anywhere]">On “{comment.quote}”</span>
        )
      )}
      {comment.reaction && <span className="font-medium">{REACTION_LABELS[comment.reaction]}</span>}
      {comment.text !== '' && (
        <span className="text-base whitespace-pre-wrap [overflow-wrap:anywhere]">{comment.text}</span>
      )}
      <span className="text-muted [overflow-wrap:anywhere]">
        {comment.name ?? 'A reader'}, {when.format(comment.at)}, from the link “{share.title}”
      </span>
      {onWords && (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              showWordsOnOpen(item.id, comment.quote);
              void navigate(`/p/${project.id}?${new URLSearchParams({ item: item.id }).toString()}`);
            }}
          >
            Show in text
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              const target = {
                item,
                form,
                ...(project.settings.language ? { language: project.settings.language } : {}),
              };
              makeComment(target, comment).then(
                (made) => {
                  setBusy(false);
                  setResult(MADE[made]);
                },
                () => {
                  setBusy(false);
                  setResult('Vlo could not save the comment on this device.');
                },
              );
            }}
          >
            Make a comment
          </Button>
        </div>
      )}
      <p aria-live="polite" className={result === '' ? 'sr-only' : 'text-muted'}>
        {result}
      </p>
    </li>
  );
}

export function FeedbackPage() {
  const { projectId = '' } = useParams();
  const state = useProject(projectId);
  const shares = useLiveQuery(() => db.shares.where('projectId').equals(projectId).toArray(), [projectId]);
  const [filter, setFilter] = useState<Reaction | null>(null);
  const [reading, setReading] = useState(false);
  const [failed, setFailed] = useState('');
  const readOnce = useRef(false);
  const ready = sharingReady();

  useDocumentTitle(state.status === 'ready' ? `${state.project.title}, Feedback` : 'Feedback');

  // Vlo reads the new replies once when the tab opens. The writer can read them again at any time.
  useEffect(() => {
    if (!ready || !shares || readOnce.current) return;
    readOnce.current = true;
    void readReplies(shares).then((count) => {
      setFailed(failedText(count));
    });
  }, [ready, shares]);

  const groups = useMemo(
    () => (state.status === 'ready' && shares ? feedbackOf(shares, state.items) : []),
    [state, shares],
  );
  const shown = useMemo(
    () =>
      filter === null
        ? groups
        : groups
            .map((g) => ({ ...g, replies: g.replies.filter((r) => r.comment.reaction === filter) }))
            .filter((g) => g.replies.length > 0),
    [groups, filter],
  );

  if (state.status === 'loading' || shares === undefined) return null;
  if (state.status === 'missing') return <ProjectMissing />;

  const { project, items } = state;
  const byId = new Map(items.map((i) => [i.id, i]));
  const total = groups.reduce((n, g) => n + g.replies.length, 0);

  return (
    <section className="grid gap-8">
      <header className="min-w-0">
        <p className="text-sm text-muted">{projectDef(project).label}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {project.title}
        </h1>
        <ViewTabs project={project} />
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="mr-auto font-display text-2xl font-semibold">Feedback</h2>
        {ready && shares.length > 0 && (
          <Button
            type="button"
            variant="outline"
            disabled={reading}
            onClick={() => {
              setReading(true);
              void readReplies(shares).then((count) => {
                setReading(false);
                setFailed(failedText(count));
              });
            }}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {reading ? 'Reading replies' : 'Read new replies'}
          </Button>
        )}
      </div>
      {failed !== '' && (
        <p role="alert" className="text-sm text-accent-text">
          {failed}
        </p>
      )}

      {total === 0 ? (
        <p className="text-muted">
          {shares.length === 0
            ? 'Your readers’ replies show here. To make a link for them, go to Write and choose Share.'
            : 'No reader has replied yet.'}
        </p>
      ) : (
        <>
          <div role="group" aria-label="Show replies" className="flex flex-wrap gap-2">
            {[null, ...REACTIONS].map((r) => (
              <button
                key={r ?? 'all'}
                type="button"
                aria-pressed={filter === r}
                onClick={() => {
                  setFilter(r);
                }}
                className="min-h-11 rounded-full border border-rule px-4 text-sm hover:border-muted aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
              >
                {r === null ? 'All replies' : REACTION_LABELS[r]}
              </button>
            ))}
          </div>
          {shown.length === 0 && <p className="text-muted">No reply has this reaction.</p>}
          {shown.map((group) => {
            const item = group.itemId === null ? undefined : byId.get(group.itemId);
            const title =
              group.itemId === null ? 'Answers to your questions' : (item?.title ?? 'A removed item');
            return (
              <section key={group.itemId ?? 'answers'} aria-label={title} className="grid gap-3">
                <h3 className="font-display text-xl font-semibold [overflow-wrap:anywhere]">{title}</h3>
                <ul className="grid gap-2">
                  {group.replies.map((reply) => (
                    <Reply
                      key={`${reply.share.id}:${reply.comment.id}`}
                      reply={reply}
                      project={project}
                      item={item}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </section>
  );
}

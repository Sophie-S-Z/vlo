import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { TEMPLATES } from '@/features/library/templates';
import { markAllInProject } from '@/features/people/markAll';
import { FAILED, NameCheckLists } from '@/features/people/NameCheckLists';
import { db, type Item, type Person, type Project, type ShareRecord } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { refreshComments } from './comments';
import { sharingReady, ShareError } from './rpc';
import {
  createShare,
  EXPIRY_DAYS,
  prepareShare,
  projectShares,
  revokeShare,
  removeShare,
  shareableItems,
  shareLink,
  shareState,
  type ExpiryDays,
  type PreparedShare,
} from './share';
import { recordError, recordFeature } from '@/features/usage/usage';

/*
 * The Share panel (spec section 11, plan Task E3): pick items and an expiry, create a read-and-comment
 * link, and manage the project's links. A memoir link runs the private name check first (US06).
 */

type Status =
  | { step: 'choose' }
  | { step: 'working' }
  | { step: 'names'; prepared: PreparedShare; marked: number | null }
  | { step: 'created'; record: ShareRecord };

interface SharePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  items: readonly Item[];
  /** The item open in the editor, picked first. */
  currentItemId: string | null;
  people: readonly Person[];
}

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function errorText(
  problem: unknown,
  fallback = 'Vlo could not make the link. Check the storage space on this device and try again.',
): string {
  if (problem instanceof ShareError || problem instanceof RangeError) return problem.message;
  return fallback;
}

function stateText(record: ShareRecord): string {
  switch (shareState(record)) {
    case 'active':
      return `Open until ${date.format(record.expiresAt)}`;
    case 'expired':
      return `Expired on ${date.format(record.expiresAt)}`;
    case 'revoked':
      return 'Stopped';
  }
}

/** Copies the text. When the browser refuses, the field's text is selected for the writer to copy. */
async function copyText(text: string, field: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    field?.select();
    return false;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-label={label}
        onClick={() => {
          void copyText(text, null).then((ok) => {
            setState(ok ? 'copied' : 'failed');
          });
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

function LinkRow({ record, itemTitles }: { record: ShareRecord; itemTitles: ReadonlyMap<string, string> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const state = shareState(record);
  const titles = record.itemIds.map((id) => itemTitles.get(id)).filter((t) => t !== undefined);
  const ids = useId();
  return (
    <li className="grid gap-2 rounded-[var(--radius-card)] border border-rule bg-bg p-3">
      <div className="grid gap-0.5">
        <span className="font-medium [overflow-wrap:anywhere]">{record.title}</span>
        {/* A link of one item has that item's title, so the item line would say it twice. */}
        {!(titles.length === 1 && titles[0] === record.title) && (
          <span className="text-sm text-muted [overflow-wrap:anywhere]">
            {titles.length === 0
              ? `${String(record.itemIds.length)} ${record.itemIds.length === 1 ? 'item' : 'items'}`
              : titles.length <= 3
                ? titles.join(', ')
                : `${titles.slice(0, 3).join(', ')} and ${String(titles.length - 3)} more`}
          </span>
        )}
        <span className={state === 'active' ? 'text-sm' : 'text-sm text-muted'}>{stateText(record)}</span>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      {confirming ? (
        <div role="group" aria-labelledby={`${ids}-confirm`} className="grid gap-2">
          <p id={`${ids}-confirm`} className="text-sm">
            Readers lose this link at once, and their comments stay on the server until it deletes the link.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep sharing
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                revokeShare(record.id).then(
                  () => {
                    setBusy(false);
                    setConfirming(false);
                  },
                  (problem: unknown) => {
                    setBusy(false);
                    setError(errorText(problem));
                  },
                );
              }}
            >
              {busy ? 'Stopping' : 'Stop sharing'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {state === 'active' ? (
            <>
              <CopyButton text={shareLink(record)} label={`Copy link: ${record.title}`} />
              <Button
                type="button"
                variant="outline"
                disabled={refreshing}
                onClick={() => {
                  setRefreshing(true);
                  setError(null);
                  refreshComments(record).then(
                    () => {
                      setRefreshing(false);
                    },
                    (problem: unknown) => {
                      setRefreshing(false);
                      setError(errorText(problem, 'Vlo could not read the comments. Try again.'));
                    },
                  );
                }}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                {refreshing ? 'Reading comments' : 'Refresh comments'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setConfirming(true);
                }}
              >
                Stop sharing
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                removeShare(record.id).catch((problem: unknown) => {
                  setError(errorText(problem));
                });
              }}
            >
              Remove from list
            </Button>
          )}
        </div>
      )}
      {(record.comments.length > 0 || record.commentsReadAt > 0) && (
        <section aria-labelledby={`${ids}-comments`} className="grid gap-2 border-t border-rule pt-2">
          <h4 id={`${ids}-comments`} className="text-sm font-semibold">
            {record.comments.length === 1 ? '1 comment' : `${String(record.comments.length)} comments`}
          </h4>
          {record.comments.length > 0 && (
            <ul className="grid gap-2 text-sm">
              {record.comments.map((c) => (
                <li key={c.id} className="grid gap-0.5 rounded-[var(--radius-card)] bg-surface px-3 py-2">
                  {c.quote !== '' && (
                    <span className="text-muted italic [overflow-wrap:anywhere]">On “{c.quote}”</span>
                  )}
                  <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{c.text}</span>
                  <span className="text-muted">
                    <span className="[overflow-wrap:anywhere]">{c.name ?? 'A reader'}</span>,{' '}
                    {when.format(c.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {record.commentsReadAt > 0 && (
            <p className="text-xs text-muted">Checked {when.format(record.commentsReadAt)}.</p>
          )}
        </section>
      )}
    </li>
  );
}

export function SharePanel({ open, onOpenChange, project, items, currentItemId, people }: SharePanelProps) {
  const ids = useId();
  const template = TEMPLATES[project.template];
  const memoir = project.template === 'memoir';
  const shareable = useMemo(() => shareableItems(project.template, items), [project.template, items]);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => {
    const current = shareable.find((i) => i.id === currentItemId);
    return new Set(current ? [current.id] : shareable.map((i) => i.id));
  });
  const [days, setDays] = useState<ExpiryDays>(14);
  const [status, setStatus] = useState<Status>({ step: 'choose' });
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const links = useLiveQuery(() => projectShares(project.id), [project.id]);
  const itemTitles = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (status.step === 'created') linkRef.current?.select();
  }, [status]);

  const ready = sharingReady();
  const busy = status.step === 'working';
  const pickedCount = shareable.filter((i) => picked.has(i.id)).length;

  /** The people as stored now, so a link never misses a person the writer just added. */
  async function currentPeople(): Promise<readonly Person[]> {
    try {
      return await db.people.where('projectId').equals(project.id).toArray();
    } catch {
      return people;
    }
  }

  async function send(prepared: PreparedShare) {
    setStatus({ step: 'working' });
    setError(null);
    try {
      const record = await createShare(prepared, project.id, days);
      recordFeature('share-create');
      if (mounted.current) setStatus({ step: 'created', record });
    } catch (problem) {
      recordError('share-failed');
      if (!mounted.current) return;
      setError(errorText(problem));
      setStatus({ step: 'choose' });
    }
  }

  async function start() {
    setStatus({ step: 'working' });
    setError(null);
    try {
      const prepared = await prepareShare({
        project,
        items,
        itemIds: [...picked],
        people: (await currentPeople()).map((p) => ({ id: p.id, variants: p.variants })),
      });
      if (!mounted.current) return;
      if (memoir && (prepared.names.unmarked.length > 0 || prepared.names.changed.length > 0)) {
        setStatus({ step: 'names', prepared, marked: null });
        return;
      }
      await send(prepared);
    } catch (problem) {
      if (!mounted.current) return;
      setError(errorText(problem));
      setStatus({ step: 'choose' });
    }
  }

  const changeOpen = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };

  if (status.step === 'names') {
    const { prepared, marked } = status;
    const total = prepared.names.unmarked.reduce((n, c) => n + c.count, 0);
    return (
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>Check the private names</DialogTitle>
          <DialogDescription>
            The link puts an alias in place of each real name below. Nothing with a real name leaves this
            device.
          </DialogDescription>
          <NameCheckLists names={prepared.names} marked={marked} what="link" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStatus({ step: 'choose' });
              }}
            >
              Back
            </Button>
            {prepared.names.unmarked.length > 0 && marked === null && (
              <Button
                type="button"
                variant="outline"
                disabled={marking}
                onClick={() => {
                  setMarking(true);
                  const show = (count: number) => {
                    if (!mounted.current) return;
                    setMarking(false);
                    setStatus((now) =>
                      now.step === 'names' && now.prepared === prepared ? { ...now, marked: count } : now,
                    );
                  };
                  currentPeople()
                    .then((list) => markAllInProject(project.id, list))
                    .then(
                      (result) => {
                        show(result.names);
                      },
                      () => {
                        show(FAILED);
                      },
                    );
                }}
              >
                Mark all {total === 1 ? '1 name' : `${String(total)} names`}
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                void send(prepared);
              }}
            >
              Share with aliases
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-xl">
        <DialogTitle>Share for reading</DialogTitle>
        <DialogDescription>
          Readers open the link in a browser to read and comment. They cannot edit, and they need no account.
        </DialogDescription>

        {!ready ? (
          <>
            <p className="text-sm">Sharing is not set up in this build.</p>
            <div className="flex justify-end">
              <DialogClose asChild>
                <Button type="button">Close</Button>
              </DialogClose>
            </div>
          </>
        ) : status.step === 'created' ? (
          <section aria-labelledby={`${ids}-ready`} className="grid gap-3">
            <h3 id={`${ids}-ready`} className="text-sm font-semibold">
              Your link is ready
            </h3>
            <label htmlFor={`${ids}-link`} className="sr-only">
              Link for readers
            </label>
            <Input
              ref={linkRef}
              id={`${ids}-link`}
              readOnly
              value={shareLink(status.record)}
              className="font-mono text-xs"
              onFocus={(event) => {
                event.target.select();
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={shareLink(status.record)} label="Copy link" />
              <span className="text-sm text-muted">
                It stops working on {date.format(status.record.expiresAt)}.
              </span>
            </div>
            <p className="text-sm">
              Your copy on this device is the main copy. Readers see this version until you share again.
            </p>
            <p className="text-sm text-muted">
              Anyone with the whole link can read it. The part after # is the key, and it never goes to the
              server.
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  setStatus({ step: 'choose' });
                }}
              >
                Done
              </Button>
            </div>
          </section>
        ) : (
          <form
            className="grid gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (pickedCount === 0) {
                setError('Pick at least one item to share.');
                return;
              }
              void start();
            }}
          >
            <fieldset className="grid gap-2" disabled={busy}>
              <legend className="mb-2 text-sm font-semibold">What to share</legend>
              {shareable.length === 0 ? (
                <p className="text-sm text-muted">This project has no text to share yet.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setPicked(new Set(shareable.map((i) => i.id)));
                      }}
                    >
                      Pick all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setPicked(new Set());
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  <ul className="grid max-h-56 gap-0.5 overflow-y-auto rounded-[var(--radius-card)] border border-rule p-2">
                    {shareable.map((item) => (
                      <li key={item.id}>
                        <label className="flex min-h-11 items-center gap-3 rounded-[var(--radius-card)] px-2 text-sm hover:bg-bg">
                          <input
                            type="checkbox"
                            checked={picked.has(item.id)}
                            onChange={(event) => {
                              const next = new Set(picked);
                              if (event.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              setPicked(next);
                            }}
                            className="size-5 shrink-0 accent-[var(--accent)]"
                          />
                          <span className="min-w-0 [overflow-wrap:anywhere]">{item.title}</span>
                          <span className="ml-auto shrink-0 text-muted">
                            {template.kindLabel[item.kind] ?? item.kind}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-muted" aria-live="polite">
                    {pickedCount === 1 ? '1 item picked.' : `${String(pickedCount)} items picked.`}
                  </p>
                </>
              )}
            </fieldset>

            <fieldset className="grid gap-2" disabled={busy}>
              <legend className="mb-2 text-sm font-semibold">The link stops working after</legend>
              <RadioGroup
                aria-label="The link stops working after"
                value={String(days)}
                onValueChange={(next) => {
                  setDays(Number(next) as ExpiryDays);
                }}
                className="grid grid-cols-2 gap-x-4 sm:grid-cols-4"
              >
                {EXPIRY_DAYS.map((d) => (
                  <label key={d} className="flex min-h-11 items-center gap-3 text-sm">
                    <RadioGroupItem value={String(d)} />
                    {d === 1 ? '1 day' : `${String(d)} days`}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>

            {memoir && (
              <p className="text-sm text-muted">
                A memoir link puts each person&apos;s alias in place of the real name.
              </p>
            )}

            {error !== null && (
              <p role="alert" className="text-sm text-accent-text">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={busy}>
                  Close
                </Button>
              </DialogClose>
              <Button type="submit" disabled={busy || shareable.length === 0}>
                {busy ? 'Making the link' : 'Create link'}
              </Button>
            </div>
            <p aria-live="polite" className="sr-only">
              {busy ? 'Making the link.' : ''}
            </p>
          </form>
        )}

        {ready && links !== undefined && links.length > 0 && (
          <section aria-labelledby={`${ids}-links`} className="grid gap-2 border-t border-rule pt-4">
            <h3 id={`${ids}-links`} className="text-sm font-semibold">
              Links of this project
            </h3>
            <ul className="grid gap-2">
              {links.map((record) => (
                <LinkRow key={record.id} record={record} itemTitles={itemTitles} />
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

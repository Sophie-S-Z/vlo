import { Download, ExternalLink, Send } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { sourcesFor } from '@/features/cite/sources';
import { folderOf, type ExportScope } from '@/features/export/build';
import type { ExportRequest } from '@/features/export/run';
import { ExportJob } from '@/features/export/startExport';
import { hasTemplate, projectDef } from '@/features/library/templates';
import { privatePeople } from '@/features/people/people';
import type { Item, Project } from '@/lib/db';
import { downloadBytes } from '@/lib/download';
import { clock } from '@/lib/clock';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Switch } from '@/ui/switch';
import { bodyCopy, overLimits, type PostBody } from './copy';
import {
  DEFAULT_PLATFORM,
  GROUP_LABELS,
  PLATFORMS,
  platformById,
  type Platform,
  type PlatformGroup,
  type PlatformId,
} from './platforms';
import { connectWpcom, heldToken, saveWpcomDraft, wpcomClientId } from './wpcom';
import { toWxr } from './wxr';

/*
 * The Publish dialog (Phase 17 decision P1). The writer picks a platform and what to publish. Vlo makes a
 * copy that the platform's editor keeps as it is, and lists the steps to paste it there. Nothing leaves the
 * device: the writer copies and pastes. A WordPress site of the writer's own gets an import file. A build
 * with a WordPress.com app id can also save the post as a draft on WordPress.com.
 */

const PLATFORM_KEY = 'vlo:publish-platform';
const GROUPS: PlatformGroup[] = ['newsletter', 'fiction', 'markdown'];

type ScopeChoice = 'item' | 'folder' | 'project';

type Built = { step: 'working' } | { step: 'ready'; body: PostBody } | { step: 'failed' };

type Draft =
  | { step: 'idle' }
  | { step: 'saving' }
  | { step: 'saved'; url: string }
  | { step: 'failed'; message: string };

function savedPlatform(): PlatformId {
  try {
    const value = localStorage.getItem(PLATFORM_KEY);
    if (value && platformById(value)) return value as PlatformId;
  } catch {
    // A browser with no storage starts at Substack each time.
  }
  return 'substack';
}

function keepPlatform(id: PlatformId): void {
  try {
    localStorage.setItem(PLATFORM_KEY, id);
  } catch {
    // The choice is a convenience. Without storage, the dialog still works.
  }
}

/** A file name for the WordPress import file, from the post title. */
function fileName(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${base === '' ? 'post' : base.slice(0, 60)}-wordpress.xml`;
}

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  items: readonly Item[];
  /** The item open in the editor, for "This section" and "This chapter". */
  currentItemId: string | null;
}

export function PublishDialog({ open, onOpenChange, project, items, currentItemId }: PublishDialogProps) {
  const ids = useId();
  const template = projectDef(project);
  const current = items.find((i) => i.id === currentItemId && template.editorKind(i.kind) !== null) ?? null;
  const folder = current ? folderOf(items, current.id) : null;
  // A piece of writing in the new modes is the whole project. In a novel, it is one chapter or scene.
  const wholeFirst =
    !current || project.templates.some((t) => t === 'essay' || t === 'article' || t === 'research');
  const [scope, setScope] = useState<ScopeChoice>(wholeFirst ? 'project' : 'item');
  const [platformId, setPlatformId] = useState<PlatformId>(savedPlatform);
  const platform: Platform = platformById(platformId) ?? DEFAULT_PLATFORM;
  const [safe, setSafe] = useState(hasTemplate(project, 'memoir'));
  const [title, setTitle] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState('');
  const [draft, setDraft] = useState<Draft>({ step: 'idle' });
  const clientId = wpcomClientId();

  const scopeOf = (choice: ScopeChoice): ExportScope =>
    choice === 'item' && current
      ? { kind: 'item', itemId: current.id }
      : choice === 'folder' && folder
        ? { kind: 'folder', itemId: folder.id }
        : { kind: 'project' };

  // A new scope or alias choice prepares the text again in the export worker. Each result carries the
  // choices that made it, so a result for old choices never shows.
  const jobKey = `${scope}|${String(safe)}`;
  const [prepared, setPrepared] = useState<{ key: string; job: ExportJob | null; unmarked: number } | null>(
    null,
  );
  useEffect(() => {
    if (!open) return;
    const run = { stopped: false, job: null as ExportJob | null };
    void (async () => {
      try {
        const request: Omit<ExportRequest, 'updates'> = {
          project,
          items: [...items],
          scope: scopeOf(scope),
          format: 'web',
          // A failed read of the people fails the copy, so an alias copy never goes without aliases.
          people: await privatePeople(project.id),
          sources: await sourcesFor(project.id),
          shareSafe: safe,
        };
        const started = await ExportJob.start(request);
        run.job = started.job;
        if (run.stopped) {
          started.job.close();
          return;
        }
        const unmarked = safe ? started.names.unmarked.reduce((n, c) => n + c.count, 0) : 0;
        setPrepared({ key: jobKey, job: started.job, unmarked });
      } catch {
        if (!run.stopped) setPrepared({ key: jobKey, job: null, unmarked: 0 });
      }
    })();
    return () => {
      run.stopped = true;
      run.job?.close();
    };
    // The job depends on what the post holds, not on each render of the items list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobKey, project.id]);
  const ownPrepared = prepared?.key === jobKey ? prepared : null;
  const job = ownPrepared?.job ?? null;
  const unmarked = ownPrepared?.unmarked ?? 0;

  // A platform change makes the body again from the prepared text, which is fast.
  const [made, setMade] = useState<{ job: ExportJob; platform: PlatformId; body: PostBody | null } | null>(
    null,
  );
  useEffect(() => {
    if (!job) return;
    const run = { stopped: false };
    job.post(platform.id).then(
      (body) => {
        if (!run.stopped) setMade({ job, platform: platform.id, body });
      },
      () => {
        if (!run.stopped) setMade({ job, platform: platform.id, body: null });
      },
    );
    return () => {
      run.stopped = true;
    };
  }, [job, platform.id]);
  const built: Built =
    ownPrepared && !job
      ? { step: 'failed' }
      : made?.job === job && made.platform === platform.id
        ? made.body
          ? { step: 'ready', body: made.body }
          : { step: 'failed' }
        : { step: 'working' };

  function titleOf(choice: ScopeChoice): string {
    if (choice === 'item' && current) return current.title;
    if (choice === 'folder' && folder) return folder.title;
    return project.title;
  }

  const shownTitle = title ?? titleOf(scope);
  const ready = built.step === 'ready' ? built : null;
  const body = ready ? bodyCopy(platform, ready.body, shownTitle) : null;
  const warnings = ready ? overLimits(platform, ready.body, shownTitle) : [];

  async function saveDraft() {
    if (!ready) return;
    setDraft({ step: 'saving' });
    try {
      const token = heldToken() ?? (await connectWpcom(clientId));
      const saved = await saveWpcomDraft(token, {
        title: shownTitle.trim(),
        html: ready.body.html,
        excerpt: subtitle.trim(),
      });
      setDraft({ step: 'saved', url: saved.editUrl });
    } catch (error) {
      setDraft({
        step: 'failed',
        message: error instanceof Error ? error.message : 'WordPress.com did not save the draft.',
      });
    }
  }

  const kindLabel = (item: Item) => (template.kindLabel[item.kind] ?? item.kind).toLowerCase();
  const bodyName = platform.body === 'markdown' ? 'Markdown' : platform.body === 'html' ? 'HTML' : 'text';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogTitle>Publish</DialogTitle>
        <DialogDescription>
          Vlo makes a copy that the platform keeps as it is: line breaks, indents, headings and notes. Your
          text leaves this device only when you paste it or send it yourself.
        </DialogDescription>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-platform`}>Where</Label>
            <select
              id={`${ids}-platform`}
              value={platform.id}
              onChange={(event) => {
                const next = event.target.value as PlatformId;
                setPlatformId(next);
                keepPlatform(next);
                setDraft({ step: 'idle' });
              }}
              className="min-h-11 rounded-md border border-rule bg-bg px-3 text-base text-text pointer-fine:min-h-10 pointer-fine:text-sm"
            >
              {GROUPS.map((group) => (
                <optgroup key={group} label={GROUP_LABELS[group]}>
                  {PLATFORMS.filter((p) => p.group === group).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-scope`}>What</Label>
            <select
              id={`${ids}-scope`}
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as ScopeChoice);
                setTitle(null);
              }}
              className="min-h-11 rounded-md border border-rule bg-bg px-3 text-base text-text pointer-fine:min-h-10 pointer-fine:text-sm"
            >
              <option value="project">The whole project</option>
              {folder && <option value="folder">This {kindLabel(folder)}</option>}
              {current && <option value="item">This {kindLabel(current)}</option>}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-title`}>Title</Label>
            <Input
              id={`${ids}-title`}
              value={shownTitle}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
              autoComplete="off"
            />
          </div>
          {platform.subtitle && (
            <div className="grid gap-2">
              <Label htmlFor={`${ids}-subtitle`}>{platform.subtitle}</Label>
              <Input
                id={`${ids}-subtitle`}
                value={subtitle}
                onChange={(event) => {
                  setSubtitle(event.target.value);
                }}
                placeholder="One line that makes a reader start"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        {hasTemplate(project, 'memoir') && (
          <div className="flex items-start gap-3">
            <Switch
              id={`${ids}-safe`}
              checked={safe}
              onCheckedChange={setSafe}
              aria-describedby={`${ids}-safe-about`}
            />
            <div className="grid gap-1">
              <Label htmlFor={`${ids}-safe`}>Use the aliases</Label>
              <p id={`${ids}-safe-about`} className="text-sm text-muted">
                Each real name that you marked becomes its alias in the copy.
                {unmarked > 0 &&
                  ` ${String(unmarked)} ${unmarked === 1 ? 'name has' : 'names have'} no mark yet, so ${unmarked === 1 ? 'it goes' : 'they go'} as typed. Mark them on the People screen first.`}
              </p>
            </div>
          </div>
        )}

        <section
          aria-labelledby={`${ids}-copy`}
          className="grid gap-3 rounded-[var(--radius-card)] border border-rule p-4"
        >
          <h3 id={`${ids}-copy`} className="font-display text-lg font-semibold">
            Copy for {platform.name}
          </h3>
          {built.step === 'failed' ? (
            <p role="alert" className="text-sm text-accent-text">
              Vlo could not make the copy. Close Publish and try again.
            </p>
          ) : !body ? (
            <p className="text-sm text-muted" role="status">
              Vlo is making the copy.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!platform.titleInBody && (
                <CopyButton label="Copy the title" text={shownTitle.trim()} copied="Title copied.">
                  Copy the title
                </CopyButton>
              )}
              {platform.subtitle && subtitle.trim() !== '' && (
                <CopyButton
                  label={`Copy the ${platform.subtitle.toLowerCase()}`}
                  text={subtitle.trim()}
                  copied={`${platform.subtitle} copied.`}
                >
                  {`Copy the ${platform.subtitle.toLowerCase()}`}
                </CopyButton>
              )}
              <CopyButton
                label={`Copy the ${bodyName}`}
                text={body.text}
                {...(body.html === undefined ? {} : { html: body.html })}
                copied={`${bodyName === 'text' ? 'Text' : bodyName} copied.`}
              >
                {`Copy the ${bodyName}`}
              </CopyButton>
              {platform.id === 'wordpress' && ready && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const xml = toWxr({
                      title: shownTitle.trim(),
                      excerpt: subtitle.trim(),
                      html: ready.body.html,
                      at: clock.now(),
                    });
                    downloadBytes(fileName(shownTitle), 'application/xml', new TextEncoder().encode(xml));
                  }}
                >
                  <Download aria-hidden="true" className="size-4" />
                  WordPress import file
                </Button>
              )}
            </div>
          )}
          {warnings.map((warning) => (
            <p key={warning} className="text-sm text-accent-text">
              {warning}
            </p>
          ))}
          {platform.id === 'wordpress' && clientId !== '' && ready && (
            <div className="grid gap-2 border-t border-rule pt-3">
              <p className="text-sm text-muted">
                On WordPress.com, Vlo can save the post as a draft for you. You sign in to WordPress.com in a
                new window and pick the site. Vlo never publishes it.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={draft.step === 'saving'}
                  onClick={() => {
                    void saveDraft();
                  }}
                >
                  <Send aria-hidden="true" className="size-4" />
                  Save as a draft on WordPress.com
                </Button>
                {draft.step === 'saved' && (
                  <a
                    href={draft.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-accent-text underline"
                  >
                    Open the draft
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                  </a>
                )}
              </div>
              <p role="status" className="text-sm text-muted">
                {draft.step === 'saving'
                  ? 'Saving the draft on WordPress.com.'
                  : draft.step === 'saved'
                    ? 'WordPress.com has the draft.'
                    : draft.step === 'failed'
                      ? draft.message
                      : ''}
              </p>
            </div>
          )}
        </section>

        <section aria-labelledby={`${ids}-steps`} className="grid gap-2">
          <h3 id={`${ids}-steps`} className="font-display text-lg font-semibold">
            In {platform.name}
          </h3>
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            {platform.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={`${ids}-changes`} className="grid gap-2">
          <h3 id={`${ids}-changes`} className="text-sm font-semibold">
            What {platform.name} changes
          </h3>
          <ul className="grid list-disc gap-1 pl-5 text-sm text-muted">
            {platform.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </section>
        <div className="flex justify-end">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Done
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

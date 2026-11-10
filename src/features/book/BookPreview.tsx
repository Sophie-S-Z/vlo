import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { readOwnFonts, ExportJob } from '@/features/export/startExport';
import { hasTemplate } from '@/features/library/templates';
import { privatePeople } from '@/features/people/people';
import { clock } from '@/lib/clock';
import type { BookSettings, Item, Project } from '@/lib/db';
import { cn } from '@/ui/cn';
import { TRIM_POINTS } from './book';

/*
 * The previews of the Book screen (roadmap F51, plan Tasks J5 and J6). The export worker reads the text
 * once, then lays out the book again one second after each change of the settings. Print shows two facing
 * pages of the PDF's own layout, as paper. E-reader and Phone show the book EPUB's XHTML and CSS in a
 * frame of that shape. The frame runs no script.
 */

type View = 'print' | 'reader' | 'phone';

const VIEWS: { id: View; label: string }[] = [
  { id: 'print', label: 'Print' },
  { id: 'reader', label: 'E-reader' },
  { id: 'phone', label: 'Phone' },
];

/** The page indexes of a spread: the first page sits alone on the right, as in a printed book. */
function spreadPages(spread: number, pages: number): [number | null, number | null] {
  if (spread === 0) return [null, 0];
  const right = 2 * spread;
  return [right - 1, right < pages ? right : null];
}

function spreadLabel(spread: number, pages: number): string {
  const [left, right] = spreadPages(spread, pages);
  const shown = [left, right].flatMap((p) => (p === null ? [] : [String(p + 1)]));
  return `${shown.length === 1 ? 'Page' : 'Pages'} ${shown.join(' and ')} of ${String(pages)}`;
}

interface Laid {
  pages: number;
  size: readonly [number, number];
}

const DELAY_MS = 1000;

export function BookPreview({
  project,
  items,
  book,
}: {
  project: Project;
  items: readonly Item[];
  book: BookSettings;
}) {
  const id = useId();
  const start = useRef({ project, items });
  const job = useRef<Promise<ExportJob> | null>(null);
  // The worker answers one call at a time.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // The last layout, with the settings it shows. A change of settings is building until its layout comes.
  const [shown, setShown] = useState<{ key: string; laid: Laid } | null>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(book);
  const laid = shown?.laid ?? null;
  const [spread, setSpread] = useState(0);
  const [urls, setUrls] = useState<{ spread: number; left: string | null; right: string | null } | null>(
    null,
  );
  const [view, setView] = useState<View>('print');
  // The e-reader and phone text, with the settings it shows.
  const [page, setPage] = useState<{ key: string; html: string } | null>(null);
  const status = failed
    ? 'failed'
    : (view === 'print' ? shown?.key : page?.key) === key
      ? 'ready'
      : 'building';

  const run = <T,>(task: (job: ExportJob) => Promise<T>): Promise<T> => {
    const next = queue.current.then(async () => {
      const ready = await job.current;
      if (!ready) throw new Error('The preview stopped.');
      return task(ready);
    });
    queue.current = next.catch(() => undefined);
    return next;
  };

  // One job for the screen: it reads the text, the private names and the writer's own fonts once.
  useEffect(() => {
    const { project, items } = start.current;
    const started = (async () => {
      const { job, ownFonts } = await ExportJob.start({
        project,
        items: [...items],
        scope: { kind: 'project' },
        format: 'pdf',
        people: await privatePeople(project.id),
        // As the Export dialog starts: a memoir gets its aliases, and AI text gets the provenance page.
        shareSafe: hasTemplate(project, 'memoir'),
        ...(project.settings.aiInsertedAt !== undefined ? { provenance: { at: clock.now() } } : {}),
      });
      try {
        await job.check(await readOwnFonts(ownFonts));
      } catch (error) {
        job.close();
        throw error;
      }
      return job;
    })();
    job.current = started;
    return () => {
      job.current = null;
      started.then(
        (ready) => {
          ready.close();
        },
        () => undefined,
      );
    };
  }, []);

  // Lay out the book again one second after a change.
  const first = useRef(true);
  useEffect(() => {
    let stale = false;
    const timer = window.setTimeout(
      () => {
        run((ready) => ready.lay(book)).then(
          (result) => {
            if (stale) return;
            setFailed(false);
            setShown({ key, laid: result });
            setSpread((s) => Math.min(s, Math.floor(result.pages / 2)));
          },
          () => {
            if (!stale) setFailed(true);
          },
        );
      },
      first.current ? 0 : DELAY_MS,
    );
    first.current = false;
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
    // The key holds every setting, so `book` itself need not be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Draw the two pages on show.
  useEffect(() => {
    if (!laid) return;
    let stale = false;
    const [left, right] = spreadPages(spread, laid.pages);
    const from = left ?? right ?? 0;
    run((ready) => ready.draw(from, right ?? from)).then(
      (svgs) => {
        if (stale) return;
        const url = (svg: string | undefined) =>
          svg === undefined ? null : URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        setUrls({
          spread,
          left: left === null ? null : url(svgs[0]),
          right: right === null ? null : url(svgs[left === null ? 0 : 1]),
        });
      },
      () => {
        if (!stale) setFailed(true);
      },
    );
    return () => {
      stale = true;
    };
  }, [laid, spread]);

  // A drawn page stays until the next one replaces it, so a page on show never loses its image.
  useEffect(
    () => () => {
      for (const u of [urls?.left, urls?.right]) if (u) URL.revokeObjectURL(u);
    },
    [urls],
  );

  // The e-reader and phone text, one second after a change, while one of them is on show.
  const pageKey = page?.key;
  useEffect(() => {
    if (view === 'print' || pageKey === key) return;
    let stale = false;
    const fontBase = new URL(import.meta.env.BASE_URL, window.location.href).href;
    const timer = window.setTimeout(
      () => {
        run((ready) => ready.epub(book, fontBase)).then(
          (html) => {
            if (stale) return;
            setFailed(false);
            setPage({ key, html });
          },
          () => {
            if (!stale) setFailed(true);
          },
        );
      },
      pageKey === undefined ? 0 : DELAY_MS,
    );
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, view]);

  const [width, height] = laid?.size ?? TRIM_POINTS[book.trim];
  const pages = laid?.pages ?? 0;
  const [left, right] = spreadPages(spread, pages);
  const sheet = (side: 'left' | 'right', index: number | null) => {
    const url = urls?.spread === spread ? urls[side] : null;
    if (index === null) return <div className="flex-1" />;
    return (
      <div className="flex-1 bg-white shadow-[0_1px_2px_rgb(0_0_0/0.1),0_12px_28px_-14px_rgb(0_0_0/0.35)]">
        {url && <img src={url} alt={`Page ${String(index + 1)}`} className="block size-full" />}
      </div>
    );
  };

  const frame = (label: string) =>
    page && (
      <iframe title={label} sandbox="allow-same-origin" srcDoc={page.html} className="size-full bg-white" />
    );

  return (
    <div className="grid gap-3">
      <RadioGroupPrimitive.Root
        aria-label="Preview"
        value={view}
        onValueChange={(next) => {
          setView(next as View);
        }}
        className="inline-flex justify-self-start gap-1 rounded-[var(--radius-card)] border border-rule bg-surface p-1"
      >
        {VIEWS.map((v) => (
          <RadioGroupPrimitive.Item
            key={v.id}
            value={v.id}
            className="min-h-11 rounded-[calc(var(--radius-card)-0.25rem)] px-3 text-sm font-medium text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent data-[state=checked]:bg-bg data-[state=checked]:text-text pointer-fine:min-h-9"
          >
            {v.label}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      <div
        aria-busy={status === 'building'}
        className="grid place-items-center rounded-[var(--radius-card)] border border-rule bg-bg p-4 sm:p-8"
      >
        {view === 'print' ? (
          <div
            className={cn(
              'flex w-full max-w-3xl transition-opacity duration-200 ease-out',
              status === 'building' && laid && 'opacity-60',
            )}
            style={{ aspectRatio: `${String(2 * width)} / ${String(height)}` }}
          >
            {sheet('left', laid ? left : null)}
            {sheet('right', laid ? right : 0)}
          </div>
        ) : view === 'reader' ? (
          <div className="aspect-[3/4] w-full max-w-[24rem] rounded-2xl border border-rule bg-surface p-4">
            {frame('E-reader preview')}
          </div>
        ) : (
          <div className="aspect-[9/19.5] w-full max-w-[18rem] rounded-[2rem] border border-rule bg-surface p-2.5">
            <div className="size-full overflow-hidden rounded-[1.375rem]">{frame('Phone preview')}</div>
          </div>
        )}
      </div>
      {view === 'print' && laid && pages > 1 && (
        <div className="grid gap-1">
          <div className="flex items-baseline justify-between">
            <label htmlFor={`${id}-page`} className="text-sm font-medium">
              Page
            </label>
            <span aria-hidden="true" className="text-sm text-muted tabular-nums">
              {spreadLabel(spread, pages)}
            </span>
          </div>
          <input
            id={`${id}-page`}
            type="range"
            min={0}
            max={Math.floor(pages / 2)}
            value={spread}
            aria-valuetext={spreadLabel(spread, pages)}
            onChange={(event) => {
              setSpread(Number(event.target.value));
            }}
            className="min-h-11 w-full accent-[var(--accent)]"
          />
        </div>
      )}
      {/* The slider names the page count, so a finished layout is said only to a screen reader. */}
      <p role="status" className={cn('text-sm text-muted', status === 'ready' && 'sr-only')}>
        {status === 'failed'
          ? 'Vlo could not lay out the book. Reload the page and try again.'
          : status === 'building'
            ? 'Laying out the pages.'
            : view === 'print'
              ? `${String(pages)} pages.`
              : 'The e-book text is ready.'}
      </p>
    </div>
  );
}

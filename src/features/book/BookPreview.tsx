import { useEffect, useId, useRef, useState } from 'react';
import { readOwnFonts, ExportJob } from '@/features/export/startExport';
import { hasTemplate } from '@/features/library/templates';
import { privatePeople } from '@/features/people/people';
import type { BookSettings, Item, Project } from '@/lib/db';
import { cn } from '@/ui/cn';
import { TRIM_POINTS } from './book';

/*
 * The print preview of the Book screen (roadmap F51, plan Task J5). The export worker reads the text once,
 * then lays out the book again one second after each change of the settings, from the same layout as the
 * PDF. Two facing pages show at a time, as paper.
 */

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
  const status = failed ? 'failed' : shown?.key === key ? 'ready' : 'building';
  const [spread, setSpread] = useState(0);
  const [urls, setUrls] = useState<{ spread: number; left: string | null; right: string | null } | null>(
    null,
  );

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
        // As the Export dialog starts: a memoir gets its aliases.
        shareSafe: hasTemplate(project, 'memoir'),
      });
      await job.check(await readOwnFonts(ownFonts));
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
    const made: string[] = [];
    const [left, right] = spreadPages(spread, laid.pages);
    const from = left ?? right ?? 0;
    run((ready) => ready.draw(from, right ?? from)).then(
      (svgs) => {
        if (stale) return;
        const url = (svg: string | undefined) => {
          if (svg === undefined) return null;
          const made1 = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
          made.push(made1);
          return made1;
        };
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
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [laid, spread]);

  const [width, height] = laid?.size ?? TRIM_POINTS[book.trim];
  const pages = laid?.pages ?? 0;
  const [left, right] = spreadPages(spread, pages);
  const page = (side: 'left' | 'right', index: number | null) => {
    const url = urls?.spread === spread ? urls[side] : null;
    if (index === null) return <div className="flex-1" />;
    return (
      <div className="flex-1 bg-white shadow-[0_1px_2px_rgb(0_0_0/0.1),0_12px_28px_-14px_rgb(0_0_0/0.35)]">
        {url && <img src={url} alt={`Page ${String(index + 1)}`} className="block size-full" />}
      </div>
    );
  };

  return (
    <div className="grid gap-3">
      <div
        aria-busy={status === 'building'}
        className="grid place-items-center rounded-[var(--radius-card)] border border-rule bg-bg p-4 sm:p-8"
      >
        <div
          className={cn(
            'flex w-full max-w-3xl transition-opacity duration-200 ease-out',
            status === 'building' && laid && 'opacity-60',
          )}
          style={{ aspectRatio: `${String(2 * width)} / ${String(height)}` }}
        >
          {page('left', laid ? left : null)}
          {page('right', laid ? right : 0)}
        </div>
      </div>
      {laid && pages > 1 && (
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
            : `${String(pages)} pages.`}
      </p>
    </div>
  );
}

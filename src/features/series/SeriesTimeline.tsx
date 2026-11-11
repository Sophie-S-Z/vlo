import { Link } from 'react-router';
import type { ReadingItem } from '@/features/codex/codex';
import { formatDate } from '@/features/timeline/dates';

/** One scene of the timeline, with its book. A link opens the scene in its book. */
function Row({ item, book, date }: ReadingItem & { date?: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      {date && <span className="tabular-nums text-muted">{date}</span>}
      <Link to={`/p/${item.projectId}?item=${item.id}`} className="font-medium [overflow-wrap:anywhere]">
        {item.title}
      </Link>
      <span className="text-sm text-muted [overflow-wrap:anywhere]">{book}</span>
    </li>
  );
}

/** The Timeline list of the Series page (F67): the dated scenes of every book by date, then the undated ones. */
export function SeriesTimeline({ dated, undated }: { dated: ReadingItem[]; undated: ReadingItem[] }) {
  return (
    <section aria-labelledby="series-timeline" className="grid gap-3">
      <h2 id="series-timeline" className="font-display text-2xl font-semibold">
        Timeline
      </h2>
      {dated.length === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          No scene has a story date yet. In the binder of a book, open the menu of a scene and choose Story
          date.
        </p>
      ) : (
        <>
          <ol className="grid gap-1.5">
            {dated.map((row) => (
              <Row key={row.item.id} {...row} date={formatDate(row.item.storyDate ?? '')} />
            ))}
          </ol>
          {undated.length > 0 && (
            <>
              <h3 className="text-base font-semibold">Undated</h3>
              <ol className="grid gap-1.5">
                {undated.map((row) => (
                  <Row key={row.item.id} {...row} />
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}

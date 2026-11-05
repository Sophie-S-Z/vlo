import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import type { Card, CardLink, Thread } from '@/lib/db';
import { CardMenu, type CardActions } from './CardMenu';

/*
 * The List view (spec 8.1): every card of the board in a table that sorts by each column. It has every
 * action of the canvas, so a writer who uses a keyboard or a screen reader can plan without the canvas.
 */

type SortKey = 'title' | 'scene' | 'threads' | 'note';

/** The threads a card is on: the threads of its links, in thread order. */
export function threadsOf(card: Card, links: readonly CardLink[], threads: readonly Thread[]): Thread[] {
  const ids = new Set(
    links
      .filter((l) => (l.fromCardId === card.id || l.toCardId === card.id) && l.threadId !== undefined)
      .map((l) => l.threadId),
  );
  return threads.filter((t) => ids.has(t.id));
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Card' },
  { key: 'scene', label: 'Scene' },
  { key: 'threads', label: 'Threads' },
  { key: 'note', label: 'Note' },
];

export function BoardList({
  cards,
  threads,
  links,
  itemTitles,
  actions,
}: {
  cards: readonly Card[];
  threads: readonly Thread[];
  links: readonly CardLink[];
  itemTitles: ReadonlyMap<string, string>;
  actions: CardActions;
}) {
  const [sort, setSort] = useState<{ key: SortKey; up: boolean } | null>(null);

  const rows = cards.map((card) => ({
    card,
    scene: card.itemId ? (itemTitles.get(card.itemId) ?? '') : '',
    threads: threadsOf(card, links, threads)
      .map((t) => t.name)
      .join(', '),
    note: card.note ?? '',
  }));
  const value = (row: (typeof rows)[number], key: SortKey) => (key === 'title' ? row.card.title : row[key]);
  if (sort) {
    const compare = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }).compare;
    rows.sort((a, b) => {
      const order = compare(value(a, sort.key), value(b, sort.key));
      return sort.up ? order : -order;
    });
  }

  if (cards.length === 0)
    return (
      <p className="rounded-[var(--radius-card)] border border-rule p-6 text-muted">
        The board is empty. Add a card, or make one card for each scene with Cards from scenes.
      </p>
    );

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-rule">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">Cards on the Story Board</caption>
        <thead>
          <tr className="border-b border-rule">
            {COLUMNS.map((column) => {
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.up ? 'ascending' : 'descending') : 'none'}
                  className="p-0 font-medium"
                >
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-1 px-3 text-left hover:bg-surface"
                    onClick={() => {
                      setSort(active ? { key: column.key, up: !sort.up } : { key: column.key, up: true });
                    }}
                  >
                    {column.label}
                    {active &&
                      (sort.up ? (
                        <ArrowUp aria-hidden="true" className="size-3.5" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="size-3.5" />
                      ))}
                  </button>
                </th>
              );
            })}
            <th scope="col" className="w-12 px-3">
              <span className="sr-only">Options</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.card.id} className="border-b border-rule last:border-b-0">
              <th scope="row" className="px-3 py-2 font-medium">
                {row.card.title}
              </th>
              <td className="px-3 py-2">{row.scene || <span className="text-muted">None</span>}</td>
              <td className="px-3 py-2">{row.threads || <span className="text-muted">None</span>}</td>
              <td className="max-w-64 px-3 py-2 text-muted">{row.note}</td>
              <td className="px-1 py-1">
                <CardMenu card={row.card} actions={actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

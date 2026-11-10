import type { CodexEntry } from '@/lib/db';

/**
 * Where each entry comes in the text (F42): a row for each entry and a column for each text item, in
 * binder order, or for each book of a series (F59). A cell shows how many times the entry's names come in
 * that column. The table scrolls sideways inside its box, so a long project never widens the page.
 */
export function CodexMatrix({
  entries,
  columns,
  noun,
  matrix,
}: {
  entries: readonly CodexEntry[];
  columns: readonly { id: string; title: string }[];
  /** What a column is, such as "item". */
  noun: string;
  matrix: Map<string, Map<string, number>>;
}) {
  if (entries.length === 0 || columns.length === 0) return null;
  return (
    <section aria-labelledby="codex-matrix" className="grid gap-2">
      <h3 id="codex-matrix" className="text-base font-semibold">
        Mentions
      </h3>
      <p className="text-sm text-muted">How many times each name comes in each {noun}.</p>
      <div
        // The box takes focus, so a keyboard can scroll a wide table.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-labelledby="codex-matrix"
        className="overflow-x-auto rounded-md border border-rule focus-visible:ring-2 focus-visible:ring-accent"
      >
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-bg px-3 py-2 text-left font-medium">
                Entry
              </th>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className="max-w-32 truncate px-3 py-2 text-left font-medium text-muted"
                  title={column.title}
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const row = matrix.get(entry.id);
              return (
                <tr key={entry.id} className="border-t border-rule">
                  <th scope="row" className="sticky left-0 bg-bg px-3 py-2 text-left font-medium">
                    {entry.name}
                  </th>
                  {columns.map((column) => (
                    <td key={column.id} className="px-3 py-2 text-center tabular-nums">
                      {row?.get(column.id) ?? <span className="sr-only">0</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

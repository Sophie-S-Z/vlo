import type { Editor } from '@tiptap/core';
import { useRef, useState, type KeyboardEvent } from 'react';
import { closePanel } from '../../commands/editorBus';
import { TABLE_GRID } from '../../extensions/table';

const size = (rows: number, columns: number) =>
  `${String(rows)} ${rows === 1 ? 'row' : 'rows'}, ${String(columns)} ${columns === 1 ? 'column' : 'columns'}`;

/**
 * Insert > Table: a grid of up to 8 rows and 8 columns. A point or the arrow keys mark the size, and a click
 * or Enter puts the table at the caret, with a header row.
 */
export function TablePanel({ editor }: { editor: Editor }) {
  const [at, setAt] = useState({ row: 1, column: 1 });
  const grid = useRef<HTMLDivElement>(null);
  const cells = Array.from({ length: TABLE_GRID * TABLE_GRID }, (_, i) => ({
    row: Math.floor(i / TABLE_GRID) + 1,
    column: (i % TABLE_GRID) + 1,
  }));

  const insert = (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    closePanel();
  };

  const move = (row: number, column: number) => {
    const next = {
      row: Math.min(Math.max(row, 1), TABLE_GRID),
      column: Math.min(Math.max(column, 1), TABLE_GRID),
    };
    setAt(next);
    grid.current
      ?.querySelector<HTMLElement>(`[data-cell="${String(next.row)}-${String(next.column)}"]`)
      ?.focus();
  };

  const onKey = (event: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    };
    const step = moves[event.key];
    if (!step) return;
    event.preventDefault();
    move(at.row + step[0], at.column + step[1]);
  };

  return (
    <div className="grid gap-2">
      <h2 className="text-sm font-medium">Table</h2>
      <div
        ref={grid}
        role="group"
        aria-label="Table size"
        className="grid w-max grid-cols-8 gap-1"
        onPointerLeave={() => {
          setAt({ row: 1, column: 1 });
        }}
      >
        {cells.map((cell) => {
          const marked = cell.row <= at.row && cell.column <= at.column;
          const here = cell.row === at.row && cell.column === at.column;
          return (
            <button
              key={`${String(cell.row)}-${String(cell.column)}`}
              type="button"
              data-cell={`${String(cell.row)}-${String(cell.column)}`}
              tabIndex={here ? 0 : -1}
              aria-label={size(cell.row, cell.column)}
              data-marked={marked || undefined}
              onPointerEnter={() => {
                setAt(cell);
              }}
              onFocus={() => {
                setAt(cell);
              }}
              onKeyDown={onKey}
              onClick={() => {
                insert(cell.row, cell.column);
              }}
              className="size-8 rounded-sm border border-rule bg-bg outline-none focus-visible:ring-2 focus-visible:ring-accent data-marked:border-accent data-marked:bg-accent/20 pointer-fine:size-6"
            />
          );
        })}
      </div>
      <p aria-hidden="true" className="text-xs text-muted">
        {size(at.row, at.column)}
      </p>
    </div>
  );
}

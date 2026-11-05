import { Fragment } from 'react';
import type { Item } from '@/lib/db';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import { formatDate } from './dates';
import { byTheme } from './memories';
import { MemoryMenu, type MemoryActions } from './MemoryMenu';
import { memoryTransitionName } from './useTimeline';

/*
 * By theme (spec 8.2, US07): a column for each theme, with each memory once under each of its themes, and
 * "No theme" for the rest. The first copy of a memory keeps its view transition name, so a switch from the
 * track moves each card to its column (Flip). Calm mode switches at once.
 */

export function ThemeColumns({ memories, actions }: { memories: readonly Item[]; actions: MemoryActions }) {
  const columns = byTheme(memories);
  const named = new Set<string>();

  if (memories.length === 0)
    return (
      <p className="rounded-[var(--radius-card)] border border-rule p-6 text-muted">
        This memoir has no memories yet. Add one with Add memory.
      </p>
    );

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((column) => (
        <section
          key={column.theme ?? ''}
          aria-label={column.theme ?? 'No theme'}
          className="grid w-60 shrink-0 content-start gap-2 rounded-[var(--radius-card)] border border-rule p-3"
        >
          <h2 className="flex items-baseline justify-between gap-2 font-display text-lg font-semibold">
            <span className="[overflow-wrap:anywhere]">{column.theme ?? 'No theme'}</span>
            <span className="font-sans text-sm font-normal text-muted">{column.memories.length}</span>
          </h2>
          <ul className="grid gap-2">
            {column.memories.map((memory) => {
              const first = !named.has(memory.id);
              named.add(memory.id);
              const date = memory.memory?.date;
              const body = (
                <li className="flex items-start gap-1 rounded-[var(--radius-card)] border border-rule bg-surface p-2 pl-3 shadow-sm">
                  <button
                    type="button"
                    className="grid min-h-11 min-w-0 flex-1 text-left"
                    onClick={() => {
                      actions.open(memory);
                    }}
                  >
                    <span className="font-display font-semibold [overflow-wrap:anywhere] hover:underline">
                      {memory.title}
                    </span>
                    <span className="text-xs text-muted">
                      {date === undefined ? 'No date' : formatDate(date)}
                    </span>
                  </button>
                  <MemoryMenu memory={memory} actions={actions} />
                </li>
              );
              return first ? (
                <MotionViewTransition key={memory.id} name={memoryTransitionName(memory.id)} update="none">
                  {body}
                </MotionViewTransition>
              ) : (
                // A second copy under another theme has no name, so names stay unique.
                <Fragment key={memory.id}>{body}</Fragment>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

import type { Item, LifeStage } from '@/lib/db';
import { formatDate } from './dates';
import { inDateOrder } from './memories';
import { MemoryMenu, type MemoryActions } from './MemoryMenu';

/*
 * The List view of the timeline (plan Task C4): every memory in date order, undated ones last, with every
 * action of the track. Under 600 px the timeline opens here (decision of 2026-11-02).
 */

export function TimelineList({
  memories,
  stages,
  actions,
}: {
  memories: readonly Item[];
  stages: readonly LifeStage[];
  actions: MemoryActions;
}) {
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  if (memories.length === 0)
    return (
      <p className="rounded-[var(--radius-card)] border border-rule p-6 text-muted">
        This memoir has no memories yet. Add one with Add memory.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-rule">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">Memories by date</caption>
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className="px-3 py-2 font-medium">
              Memory
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Date
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Life stage
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Themes
            </th>
            <th scope="col" className="w-12 px-3">
              <span className="sr-only">Options</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {inDateOrder(memories).map((memory) => {
            const date = memory.memory?.date;
            const stage = memory.memory?.lifeStageId ? stageName.get(memory.memory.lifeStageId) : undefined;
            const themes = memory.memory?.themes ?? [];
            return (
              <tr key={memory.id} className="border-b border-rule last:border-b-0">
                <th scope="row" className="px-3 py-1 font-medium">
                  <button
                    type="button"
                    className="min-h-11 text-left hover:underline"
                    onClick={() => {
                      actions.open(memory);
                    }}
                  >
                    {memory.title}
                  </button>
                </th>
                <td className="px-3 py-2">
                  {date === undefined ? <span className="text-muted">No date</span> : formatDate(date)}
                </td>
                <td className="px-3 py-2">{stage ?? <span className="text-muted">None</span>}</td>
                <td className="px-3 py-2">
                  {themes.length > 0 ? themes.join(', ') : <span className="text-muted">None</span>}
                </td>
                <td className="px-1 py-1">
                  <MemoryMenu memory={memory} actions={actions} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

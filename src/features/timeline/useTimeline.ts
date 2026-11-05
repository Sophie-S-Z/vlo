import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LifeStage } from '@/lib/db';
import { sortByOrder } from '@/lib/order';

/** The life stages of a project, in order, live. Undefined while they load. */
export function useLifeStages(projectId: string): LifeStage[] | undefined {
  return useLiveQuery(
    async () => sortByOrder(await db.lifeStages.where('projectId').equals(projectId).toArray()),
    [projectId],
  );
}

/** The view transition name of a memory card, shared by the track and the theme columns (Flip). */
export function memoryTransitionName(itemId: string): string {
  return `memory-${itemId}`;
}

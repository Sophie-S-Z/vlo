import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Item, type Project } from '@/lib/db';
import { sortByOrder } from '@/lib/order';

export type ProjectState =
  { status: 'loading' } | { status: 'missing' } | { status: 'ready'; project: Project; items: Item[] };

/** One project and its items, sorted by order key. Updates live. */
export function useProject(projectId: string): ProjectState {
  const state = useLiveQuery(async (): Promise<ProjectState> => {
    const [project, items] = await Promise.all([
      db.projects.get(projectId),
      db.items.where('projectId').equals(projectId).toArray(),
    ]);
    if (!project) return { status: 'missing' };
    return { status: 'ready', project, items: sortByOrder(items) };
  }, [projectId]);
  return state ?? { status: 'loading' };
}

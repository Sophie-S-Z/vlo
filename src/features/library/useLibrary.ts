import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Project } from '@/lib/db';

export interface LibraryProject {
  project: Project;
  wordCount: number;
}

export type LibraryState =
  { status: 'loading' } | { status: 'ready'; projects: LibraryProject[] } | { status: 'error' };

/** Every project, newest change first, with its total word count. Updates live. */
export function useLibrary(): LibraryState {
  const state = useLiveQuery(async (): Promise<LibraryState> => {
    try {
      const [projects, items] = await Promise.all([
        db.projects.orderBy('updatedAt').reverse().toArray(),
        db.items.toArray(),
      ]);
      const words = new Map<string, number>();
      for (const item of items) words.set(item.projectId, (words.get(item.projectId) ?? 0) + item.wordCount);
      return {
        status: 'ready',
        projects: projects.map((project) => ({ project, wordCount: words.get(project.id) ?? 0 })),
      };
    } catch {
      return { status: 'error' };
    }
  });
  return state ?? { status: 'loading' };
}

import { clock } from '@/lib/clock';
import { dayStartKey } from '@/features/editor/stats/dayStart';
import { db, type Item, type Project, type Template } from '@/lib/db';
import { newId } from '@/lib/ids';
import { orderBetween } from '@/lib/order';
import { requestPersistence } from '@/lib/storage';
import { deleteItemDoc } from '@/lib/itemDocName';
import { TEMPLATES, type StarterItem } from './templates';

export interface NewProjectInput {
  title: string;
  template: Template;
  authorName?: string;
}

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === '') throw new Error('A project needs a title.');
  return trimmed;
}

/** Creates a project with its starter items. Returns the first item the writer can type in. */
export async function createProject(
  input: NewProjectInput,
): Promise<{ project: Project; firstItemId: string }> {
  const now = clock.now();
  const def = TEMPLATES[input.template];
  const project: Project = {
    id: newId(),
    title: cleanTitle(input.title),
    template: input.template,
    aiMode: 'pen',
    ...(input.authorName ? { authorName: input.authorName } : {}),
    createdAt: now,
    updatedAt: now,
    settings: {
      snapshotEveryMinutes: 10,
      aliasAiRequests: input.template === 'memoir',
      streaksEnabled: false,
      restDays: [],
    },
  };

  const items: Item[] = [];
  const add = (starters: StarterItem[], parentId: string | null) => {
    let previous: string | null = null;
    for (const starter of starters) {
      const order = orderBetween(previous, null);
      previous = order;
      const item: Item = {
        id: newId(),
        projectId: project.id,
        parentId,
        kind: starter.kind,
        title: starter.title,
        status: 'draft',
        order,
        wordCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      items.push(item);
      if (starter.children) add(starter.children, item.id);
    }
  };
  add(def.starter, null);

  const first = items.find((i) => def.editorKind(i.kind) !== null);
  if (!first) throw new Error(`Template ${def.id} has no writable starter item.`);

  const isFirstProject = (await db.projects.count()) === 0;
  await db.transaction('rw', db.projects, db.items, async () => {
    await db.projects.add(project);
    await db.items.bulkAdd(items);
  });

  // Firefox can show a prompt for persistent storage. The writer goes to the first page without waiting for an answer.
  if (isFirstProject) void recordPersistence();

  return { project, firstItemId: first.id };
}

async function recordPersistence(): Promise<void> {
  try {
    const answer = await requestPersistence();
    await db.appMeta.put({ key: 'persistence', value: answer });
  } catch {
    // With no stored answer, Settings still shows what the browser reports now.
  }
}

/** Changes some of a project's settings, such as its font or page format, and keeps the rest. */
export async function updateProjectSettings(id: string, change: Partial<Project['settings']>): Promise<void> {
  await db.projects
    .where('id')
    .equals(id)
    .modify((project) => {
      project.settings = { ...project.settings, ...change };
      project.updatedAt = clock.now();
    });
}

export async function renameProject(id: string, title: string): Promise<void> {
  await db.projects.update(id, { title: cleanTitle(title), updatedAt: clock.now() });
}

/** Deletes a project, its rows and every item's stored text. */
export async function deleteProject(id: string): Promise<void> {
  const itemIds = await db.transaction(
    'rw',
    [db.projects, db.items, db.snapshots, db.sessions, db.itemTexts, db.appMeta],
    async () => {
      // Read the ids in the same transaction, so an item added from another tab cannot be left behind.
      const ids = await db.items.where('projectId').equals(id).primaryKeys();
      await db.items.where('projectId').equals(id).delete();
      await db.snapshots.where('projectId').equals(id).delete();
      await db.sessions.where('projectId').equals(id).delete();
      await db.itemTexts.where('projectId').equals(id).delete();
      // The start of today's word count (writing stats).
      await db.appMeta.delete(dayStartKey(id));
      await db.projects.delete(id);
      return ids;
    },
  );
  await Promise.all(itemIds.map((itemId) => deleteItemDoc(itemId)));
}

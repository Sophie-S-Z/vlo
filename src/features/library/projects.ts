import { clock } from '@/lib/clock';
import { cleanDayStart, dayStartKey } from '@/features/editor/stats/dayStart';
import { db, viewTables, type Item, type Project, type Template } from '@/lib/db';
import { newId } from '@/lib/ids';
import { orderBetween } from '@/lib/order';
import { requestPersistence } from '@/lib/storage';
import { recountItems } from '@/lib/wordcount';
import { deleteItemDoc } from '@/lib/itemDocName';
import { cleanTemplates, misfits, projectDef, type StarterItem } from './templates';

export interface NewProjectInput {
  title: string;
  /** One or more templates. The project gets the binder kinds and the views of each. */
  templates: readonly Template[];
  authorName?: string;
}

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === '') throw new Error('A project needs a title.');
  return trimmed;
}

/** A new project row with the default settings, for a new project or an import. */
export function newProject(input: NewProjectInput, now: number): Project {
  const templates = cleanTemplates(input.templates);
  return {
    id: newId(),
    title: cleanTitle(input.title),
    templates,
    aiMode: 'pen',
    ...(input.authorName ? { authorName: input.authorName } : {}),
    createdAt: now,
    updatedAt: now,
    settings: {
      snapshotEveryMinutes: 10,
      aliasAiRequests: templates.includes('memoir'),
      streaksEnabled: false,
      restDays: [],
    },
  };
}

/** Creates a project with its starter items. Returns the first item the writer can type in. */
export async function createProject(
  input: NewProjectInput,
): Promise<{ project: Project; firstItemId: string }> {
  const now = clock.now();
  const project = newProject(input, now);
  const def = projectDef(project.templates);

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
  if (!first) throw new Error(`Template ${project.templates.join('+')} has no writable starter item.`);

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

/**
 * Changes some of a project's settings, such as its font or page format, and keeps the rest. A new
 * language counts every item again, because Chinese and Japanese count characters (F38).
 */
export async function updateProjectSettings(id: string, change: Partial<Project['settings']>): Promise<void> {
  await db.transaction('rw', [db.projects, db.items, db.itemTexts, db.appMeta], async () => {
    await db.projects
      .where('id')
      .equals(id)
      .modify((project) => {
        project.settings = { ...project.settings, ...change };
        project.updatedAt = clock.now();
      });
    if (!('language' in change)) return;
    const [items, texts] = await Promise.all([
      db.items.where('projectId').equals(id).toArray(),
      db.itemTexts.where('projectId').equals(id).toArray(),
    ]);
    const counted = recountItems(items, texts, change.language);
    await db.items.bulkPut(counted);
    // Today's count keeps what the writer added before the change.
    const total = (list: readonly Item[]) => list.reduce((sum, item) => sum + item.wordCount, 0);
    const key = dayStartKey(id);
    const today = cleanDayStart((await db.appMeta.get(key))?.value);
    if (today)
      await db.appMeta.put({ key, value: { ...today, start: today.start + total(counted) - total(items) } });
  });
}

export async function renameProject(id: string, title: string): Promise<void> {
  await db.projects.update(id, { title: cleanTitle(title), updatedAt: clock.now() });
}

/**
 * Gives the project new templates and returns []. While items do not fit the new templates, it changes
 * nothing and returns those items. View data such as cards stays, so it shows again when a template comes back.
 */
export async function changeTemplates(id: string, templates: readonly Template[]): Promise<Item[]> {
  const next = cleanTemplates(templates);
  return db.transaction('rw', db.projects, db.items, async () => {
    const blocking = misfits(await db.items.where('projectId').equals(id).toArray(), next);
    if (blocking.length === 0) await db.projects.update(id, { templates: next, updatedAt: clock.now() });
    return blocking;
  });
}

/**
 * Deletes a project, its rows, its research files and every item's stored text. A Replace import keeps the project's share
 * links (`keepShares`): it brings back the same project id, and the links' keys and owner tokens exist
 * only on this device.
 */
export async function deleteProject(id: string, options: { keepShares?: boolean } = {}): Promise<void> {
  const itemIds = await db.transaction(
    'rw',
    [
      db.projects,
      db.items,
      db.snapshots,
      db.sessions,
      db.itemTexts,
      db.appMeta,
      db.shares,
      db.research,
      ...viewTables(),
    ],
    async () => {
      // Read the ids in the same transaction, so an item added from another tab cannot be left behind.
      const ids = await db.items.where('projectId').equals(id).primaryKeys();
      await db.items.where('projectId').equals(id).delete();
      for (const table of viewTables()) await table.where('projectId').equals(id).delete();
      await db.snapshots.where('projectId').equals(id).delete();
      await db.sessions.where('projectId').equals(id).delete();
      await db.itemTexts.where('projectId').equals(id).delete();
      await db.research.where('projectId').equals(id).delete();
      // The keys and owner tokens of the project's links go with it. The delete dialog warns first.
      if (!options.keepShares) await db.shares.where('projectId').equals(id).delete();
      // The start of today's word count (writing stats).
      await db.appMeta.delete(dayStartKey(id));
      await db.projects.delete(id);
      return ids;
    },
  );
  await Promise.all(itemIds.map((itemId) => deleteItemDoc(itemId)));
}

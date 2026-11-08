import { db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { Source } from './match';

/*
 * The sources of the originality check that stay on the device: the writer's other items, in this project
 * and in the others (as Turnitin matches a student's own earlier papers), and sources that the writer
 * pastes in, such as an article that a chapter quotes. Pasted sources stay in this device's database.
 */

export const pastedKey = (projectId: string) => `originalitySources:${projectId}`;

export interface PastedSource {
  id: string;
  title: string;
  url?: string | undefined;
  text: string;
}

export function cleanPasted(value: unknown): PastedSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw: unknown): PastedSource[] => {
    if (!raw || typeof raw !== 'object') return [];
    const entry = raw as Partial<Record<keyof PastedSource, unknown>>;
    if (typeof entry.id !== 'string' || typeof entry.title !== 'string' || typeof entry.text !== 'string')
      return [];
    return [
      {
        id: entry.id,
        title: entry.title,
        text: entry.text,
        ...(typeof entry.url === 'string' ? { url: entry.url } : {}),
      },
    ];
  });
}

export async function pastedSources(projectId: string): Promise<PastedSource[]> {
  return cleanPasted((await db.appMeta.get(pastedKey(projectId)))?.value);
}

export async function addPastedSource(
  projectId: string,
  source: Omit<PastedSource, 'id'>,
): Promise<PastedSource[]> {
  const next = [...(await pastedSources(projectId)), { ...source, id: newId() }];
  await db.appMeta.put({ key: pastedKey(projectId), value: next });
  return next;
}

export async function removePastedSource(projectId: string, id: string): Promise<PastedSource[]> {
  const next = (await pastedSources(projectId)).filter((source) => source.id !== id);
  await db.appMeta.put({ key: pastedKey(projectId), value: next });
  return next;
}

/** The writer's other items as sources: this project only, or every project on the device. */
export async function ownSources(
  itemId: string,
  projectId: string,
  everyProject: boolean,
): Promise<Source[]> {
  const texts = everyProject
    ? await db.itemTexts.toArray()
    : await db.itemTexts.where('projectId').equals(projectId).toArray();
  const others = texts.filter((entry) => entry.itemId !== itemId && entry.text.trim() !== '');
  const items = new Map(
    (await db.items.bulkGet(others.map((entry) => entry.itemId))).flatMap((item) =>
      item ? [[item.id, item]] : [],
    ),
  );
  const projects = new Map((await db.projects.toArray()).map((project) => [project.id, project.title]));
  return others.map((entry): Source => {
    const title = items.get(entry.itemId)?.title ?? 'Untitled item';
    const project = projects.get(entry.projectId);
    return {
      id: `own:${entry.itemId}`,
      title: entry.projectId === projectId || !project ? title : `${title} (${project})`,
      origin: 'own',
      text: entry.text,
    };
  });
}

export function pastedAsSources(list: readonly PastedSource[]): Source[] {
  return list.map((source) => ({
    id: `pasted:${source.id}`,
    title: source.title,
    origin: 'pasted',
    url: source.url,
    text: source.text,
  }));
}

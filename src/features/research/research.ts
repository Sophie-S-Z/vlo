import { useLiveQuery } from 'dexie-react-hooks';
import { clock } from '@/lib/clock';
import { db, type ResearchFile } from '@/lib/db';
import { newId } from '@/lib/ids';

/*
 * The research folder of a project (roadmap F41, plan Task H6, decision Q4). Images, PDFs, audio files and
 * clippings live in the project on this device, and backups carry them. Vlo never fetches a link: a
 * clipping keeps its link as text only.
 */

export const MB = 1024 * 1024;
/** The largest file that the folder takes. */
export const MAX_RESEARCH_FILE = 50 * MB;
/** Above this total for a project, Vlo warns that backups get large. */
export const RESEARCH_WARN = 100 * MB;
export const MAX_RESEARCH_NAME = 120;
export const MAX_CLIP = 100_000;

/** The kinds of file that the research view shows. Any other file still keeps its place. */
export const RESEARCH_ACCEPT = 'image/*,application/pdf,audio/*,text/plain';

export type ResearchView = 'image' | 'pdf' | 'audio' | 'clip' | 'other';

export function researchView(file: Pick<ResearchFile, 'type' | 'clip'>): ResearchView {
  if (file.clip) return 'clip';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'other';
}

/** The research files of a project, newest last, live. Undefined while they load. */
export function useResearch(projectId: string): ResearchFile[] | undefined {
  return useLiveQuery(
    async () => await db.research.where('projectId').equals(projectId).sortBy('addedAt'),
    [projectId],
  );
}

function cleanName(name: string): string {
  const clean = name.trim();
  if (clean === '') throw new RangeError('Type a name.');
  if (clean.length > MAX_RESEARCH_NAME)
    throw new RangeError(`A name can have up to ${String(MAX_RESEARCH_NAME)} characters.`);
  return clean;
}

async function touch(projectId: string): Promise<void> {
  await db.projects.update(projectId, { updatedAt: clock.now() });
}

export interface AddResult {
  added: ResearchFile[];
  /** The names of the files over the size limit. */
  tooLarge: string[];
  /** The project's research files now take more than RESEARCH_WARN. */
  large: boolean;
}

async function totalSize(projectId: string): Promise<number> {
  let total = 0;
  await db.research
    .where('projectId')
    .equals(projectId)
    .each((file) => (total += file.size));
  return total;
}

/** Adds files to a project. A file over MAX_RESEARCH_FILE is refused and named in the result. */
export async function addResearchFiles(projectId: string, files: readonly File[]): Promise<AddResult> {
  const tooLarge = files.filter((f) => f.size > MAX_RESEARCH_FILE).map((f) => f.name);
  const now = clock.now();
  const added = files
    .filter((f) => f.size <= MAX_RESEARCH_FILE)
    .map((f, i): ResearchFile => ({
      id: newId(),
      projectId,
      name: f.name.trim().slice(0, MAX_RESEARCH_NAME) || 'Untitled file',
      type: f.type || 'application/octet-stream',
      size: f.size,
      // Files added together keep their order.
      addedAt: now + i,
      data: f,
    }));
  await db.transaction('rw', db.research, db.projects, async () => {
    await db.research.bulkAdd(added);
    if (added.length > 0) await touch(projectId);
  });
  return { added, tooLarge, large: (await totalSize(projectId)) > RESEARCH_WARN };
}

/** Saves a recording of a memory (F57). Its name is the question that it answers. */
export async function addRecording(
  projectId: string,
  itemId: string,
  audio: Blob,
  name: string,
): Promise<ResearchFile> {
  const file: ResearchFile = {
    id: newId(),
    projectId,
    itemId,
    name: name.trim().slice(0, MAX_RESEARCH_NAME) || 'Recording',
    type: audio.type || 'audio/webm',
    size: audio.size,
    addedAt: clock.now(),
    data: audio,
  };
  await db.transaction('rw', db.research, db.projects, async () => {
    await db.research.add(file);
    await touch(projectId);
  });
  return file;
}

/** Adds a clipping: text that the writer pastes, with its link as text. Vlo never opens the link. */
export async function addClipping(
  projectId: string,
  name: string,
  text: string,
  url: string,
): Promise<ResearchFile> {
  const body = text.trim();
  if (body === '') throw new RangeError('Paste the text of the clipping.');
  if (body.length > MAX_CLIP)
    throw new RangeError(`A clipping can have up to ${MAX_CLIP.toLocaleString('en')} characters.`);
  const link = url.trim();
  const file: ResearchFile = {
    id: newId(),
    projectId,
    // With no name, the clipping takes the start of its first line.
    name: cleanName(name.trim() === '' ? (body.split('\n')[0] ?? '').slice(0, 60) : name),
    type: 'text/plain',
    size: new Blob([body, link]).size,
    addedAt: clock.now(),
    clip: link === '' ? { text: body } : { text: body, url: link },
  };
  await db.transaction('rw', db.research, db.projects, async () => {
    await db.research.add(file);
    await touch(projectId);
  });
  return file;
}

export async function renameResearch(id: string, name: string): Promise<void> {
  const clean = cleanName(name);
  await db.transaction('rw', db.research, db.projects, async () => {
    const file = await db.research.get(id);
    if (!file) return;
    await db.research.update(id, { name: clean });
    await touch(file.projectId);
  });
}

export async function deleteResearch(id: string): Promise<void> {
  await db.transaction('rw', db.research, db.projects, async () => {
    const file = await db.research.get(id);
    if (!file) return;
    await db.research.delete(id);
    await touch(file.projectId);
  });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`;
  if (bytes < MB) return `${String(Math.round(bytes / 1024))} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

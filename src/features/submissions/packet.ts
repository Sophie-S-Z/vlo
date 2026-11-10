import JSZip from 'jszip';
import { exportFileName, type ExportScope } from '@/features/export/build';
import type { ExportFile, ExportRequest } from '@/features/export/run';
import { ExportJob, readOwnFonts } from '@/features/export/startExport';
import { hasTemplate } from '@/features/library/templates';
import type { Item, Project } from '@/lib/db';
import type { NameCheck, NameCount, PrivatePerson } from '@/lib/privacy';

/*
 * Submission packets (roadmap F53, plan Task J3). A packet is one zip with a file for each piece and, when
 * the writer wrote them, a cover letter, a bio and a synopsis. Each file is an ordinary export, so the
 * name check, the aliases and the font check work as for every export. Prose in a novel uses standard
 * manuscript format when the project has its details.
 */

export type PacketFormat = 'docx' | 'pdf';

export interface PacketInput {
  project: Project;
  items: readonly Item[];
  pieceIds: readonly string[];
  format: PacketFormat;
  letter: string;
  bio: string;
  synopsis: string;
  people: PrivatePerson[];
  shareSafe: boolean;
}

/** The export of each file of a packet, in the order of the zip: the pieces, then the texts. */
export function packetRequests(input: PacketInput): Omit<ExportRequest, 'updates'>[] {
  const { project, items, format, people, shareSafe } = input;
  const base = { project, items: [...items], format, people, shareSafe } as const;
  const details = project.settings.manuscript;
  const manuscript =
    hasTemplate(project, 'novel') && details?.on && details.name.trim() !== ''
      ? { name: details.name.trim(), contact: details.contact.trim(), typewriter: details.typewriter }
      : undefined;
  const byId = new Map(items.map((item) => [item.id, item]));
  const pieces = input.pieceIds.flatMap((id): Omit<ExportRequest, 'updates'>[] => {
    const item = byId.get(id);
    if (!item || item.kind === 'note') return [];
    const scope: ExportScope =
      item.kind === 'part' || item.kind === 'chapter'
        ? { kind: 'folder', itemId: id }
        : { kind: 'item', itemId: id };
    return [{ ...base, scope, ...(manuscript ? { manuscript } : {}) }];
  });
  const texts = (
    [
      ['Cover letter', input.letter],
      ['Bio', input.bio],
      ['Synopsis', input.synopsis],
    ] as const
  ).flatMap(([name, body]): Omit<ExportRequest, 'updates'>[] =>
    body.trim() === '' ? [] : [{ ...base, scope: { kind: 'project' }, text: { name, body } }],
  );
  return [...pieces, ...texts];
}

/** The synopsis that a packet starts with: the synopsis of each piece that has one. */
export function startingSynopsis(items: readonly Item[], pieceIds: readonly string[]): string {
  const byId = new Map(items.map((item) => [item.id, item]));
  return pieceIds
    .flatMap((id) => {
      const synopsis = byId.get(id)?.synopsis?.trim();
      return synopsis ? [synopsis] : [];
    })
    .join('\n\n');
}

/** One zip of the packet's files, named after the venue. Two files with one name get a number. */
export async function zipPacket(venue: string, files: readonly ExportFile[]): Promise<ExportFile> {
  const zip = new JSZip();
  const taken = new Set<string>();
  for (const file of files) {
    const dot = file.name.lastIndexOf('.');
    const [stem, extension] = [file.name.slice(0, dot), file.name.slice(dot)];
    let name = file.name;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${stem} ${String(n)}${extension}`;
    taken.add(name.toLowerCase());
    zip.file(name, file.bytes);
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return {
    bytes,
    name: `${exportFileName(`Packet for ${venue.trim()}`)}.zip`,
    type: 'application/zip',
    notices: [...new Set(files.flatMap((file) => file.notices))],
  };
}

function addCounts(into: Map<string, number>, list: readonly NameCount[]): void {
  for (const { name, count } of list) into.set(name, (into.get(name) ?? 0) + count);
}

function sorted(counts: Map<string, number>): NameCount[] {
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export interface PacketJob {
  /** The name check of every file together, for the check before a share-safe packet. */
  names: NameCheck;
  /** Makes each file, with Vlo's stand-in for each own font that cannot go in, and zips them. */
  make: (venue: string) => Promise<ExportFile>;
  close: () => void;
}

/** Prepares each file of a packet in its own export worker. */
export async function startPacket(input: PacketInput): Promise<PacketJob> {
  const jobs: { job: ExportJob; ownFonts: string[] }[] = [];
  const unmarked = new Map<string, number>();
  const changed = new Map<string, number>();
  const close = () => {
    for (const { job } of jobs) job.close();
  };
  try {
    for (const request of packetRequests(input)) {
      const { job, ownFonts, names } = await ExportJob.start(request);
      jobs.push({ job, ownFonts });
      addCounts(unmarked, names.unmarked);
      addCounts(changed, names.changed);
    }
  } catch (error) {
    close();
    throw error;
  }
  return {
    names: { unmarked: sorted(unmarked), changed: sorted(changed) },
    close,
    make: async (venue) => {
      const files: ExportFile[] = [];
      for (const { job, ownFonts } of jobs) {
        await job.check(await readOwnFonts(ownFonts));
        files.push(await job.make());
      }
      return zipPacket(venue, files);
    },
  };
}

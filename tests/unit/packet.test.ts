import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { prepareExport, runExport } from '@/features/export/run';
import { packetRequests, startingSynopsis, zipPacket, type PacketInput } from '@/features/submissions/packet';
import type { Item, Project } from '@/lib/db';
import { item, project, proseUpdate } from './export-fixtures';

/* Submission packets (roadmap F53, plan Task J3). Review Focus 4: a memoir packet runs the name check. */

function input(extra: Partial<PacketInput> = {}): PacketInput {
  const chapter = item('c1', 'chapter', 'Chapter One');
  const scene = { ...item('s1', 'scene', 'The Harbor', 'c1'), synopsis: 'Mara comes home.' };
  const note = item('n1', 'note', 'Research');
  return {
    project: project('novel', {
      settings: { manuscript: { on: true, name: 'Ada Vell', contact: 'ada@example.org', typewriter: false } },
    }) as Project,
    items: [chapter, scene, note],
    pieceIds: ['c1', 's1', 'n1'],
    format: 'docx',
    letter: 'Dear editors,\n\nHere is my story.',
    bio: '',
    synopsis: 'Mara comes home.',
    people: [],
    shareSafe: false,
    sources: [],
    ...extra,
  };
}

const updates: [string, Uint8Array][] = [['s1', proseUpdate(['The harbour lights came on.'])]];

describe('submission packets', () => {
  test('one file for each piece, then each text that has words, and no note', () => {
    const requests = packetRequests(input());
    expect(requests.map((r) => r.scope)).toEqual([
      { kind: 'folder', itemId: 'c1' },
      { kind: 'item', itemId: 's1' },
      { kind: 'project' },
      { kind: 'project' },
    ]);
    expect(requests.map((r) => r.text?.name)).toEqual([undefined, undefined, 'Cover letter', 'Synopsis']);
    // A novel with manuscript details uses standard manuscript format for its pieces only.
    expect(requests[0]?.manuscript?.name).toBe('Ada Vell');
    expect(requests[2]?.manuscript).toBeUndefined();
  });

  test('a project with no manuscript details sends its pieces as they are', () => {
    const requests = packetRequests(input({ project: project('poetry') as Project }));
    expect(requests.every((r) => r.manuscript === undefined)).toBe(true);
  });

  test('the synopsis starts with the synopsis of each chosen piece', () => {
    const items: Item[] = [
      { ...item('a', 'scene', 'A'), synopsis: ' First. ' },
      item('b', 'scene', 'B'),
      { ...item('c', 'scene', 'C'), synopsis: 'Third.' },
    ];
    expect(startingSynopsis(items, ['c', 'b', 'a'])).toBe('Third.\n\nFirst.');
  });

  test('the zip holds each file by name, a letter with no title line, and a number for a twin name', async () => {
    const files = await Promise.all(
      packetRequests(input()).map((request) => runExport({ ...request, updates })),
    );
    const twin = files[1];
    if (!twin) throw new Error('No second file.');
    const packet = await zipPacket('  Agni  ', [...files, twin]);
    expect(packet.name).toBe('Packet for Agni.zip');
    const zip = await JSZip.loadAsync(packet.bytes);
    expect(Object.keys(zip.files)).toEqual([
      'Chapter One.docx',
      'The Harbor.docx',
      'Cover letter.docx',
      'Synopsis.docx',
      'The Harbor 2.docx',
    ]);
    const letterBytes = await zip.file('Cover letter.docx')?.async('uint8array');
    if (!letterBytes) throw new Error('No cover letter.');
    const letter = await JSZip.loadAsync(letterBytes);
    const xml = (await letter.file('word/document.xml')?.async('string')) ?? '';
    expect(xml).toContain('Dear editors,');
    expect(xml).toContain('Here is my story.');
    expect(xml).not.toContain('w:val="Title"');
  });

  test('a share-safe memoir packet finds a real name in the letter and puts the alias in', () => {
    const people = [{ id: 'p1', label: 'Mother', variants: [{ real: 'Ruth Alder', alias: 'Mae' }] }];
    const [letter] = packetRequests(
      input({
        project: project('memoir') as Project,
        pieceIds: [],
        letter: 'This memoir is about Ruth Alder.',
        synopsis: '',
        people,
        shareSafe: true,
      }),
    );
    if (!letter) throw new Error('No letter.');
    const prepared = prepareExport({ ...letter, updates: [] });
    expect(prepared.names.unmarked).toEqual([{ name: 'Ruth Alder', count: 1 }]);
    expect(JSON.stringify(prepared.doc)).not.toContain('Ruth Alder');
    expect(JSON.stringify(prepared.doc)).toContain('Mae');
  });
});

import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { collectBackup, importBackup, readBackup } from '@/features/backup/backup';
import { BackupError, writeBackup } from '@/features/backup/file';
import { DOC_SCHEMA } from '@/features/editor/docSchema';
import { imageAttrs } from '@/features/editor/extensions/image';
import { updateToJson } from '@/features/export/read';
import {
  IMAGE_GRACE_MS,
  imageIdsIn,
  imagesInUse,
  remapImageIds,
  sweepImages,
  sweepImagesDaily,
} from '@/features/images/images';
import { fitSize, hasTransparency, MAX_IMAGE_SIDE } from '@/features/images/resize';
import { createProject, deleteProject } from '@/features/library/projects';
import { clock } from '@/lib/clock';
import { db, type ImageFile } from '@/lib/db';
import { readItemUpdate, writeItemUpdate } from '@/lib/ydocs';
import { updateOf } from './export-fixtures';

/* Images in the text (Phase 16, Task G1): the stored size, the ids in the text, backups and the sweep. */

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  clock.now = () => Date.now();
  await db.delete();
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 0xff, 0xd9]);

function imageRow(id: string, projectId: string, addedAt = 1): ImageFile {
  return {
    id,
    projectId,
    type: 'image/jpeg',
    size: BYTES.byteLength,
    width: 1200,
    height: 800,
    addedAt,
    data: new Blob([BYTES], { type: 'image/jpeg' }),
  };
}

/** A scene with a paragraph, an image and a paragraph. */
function sceneWith(imageIds: readonly string[]): Uint8Array {
  return updateOf(
    {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'The harbour at dawn.' }] },
        ...imageIds.map((id) => ({
          type: 'image',
          attrs: { id, alt: 'Boats in the harbour', caption: 'Port Isaac, 1962', width: 50, align: 'left' },
        })),
        { type: 'paragraph', content: [{ type: 'text', text: 'The gulls slept.' }] },
      ],
    },
    'prose',
  );
}

async function novelWithImage() {
  const { project } = await createProject({ title: 'Salt Year', templates: ['novel'] });
  const scene = (await db.items.where('projectId').equals(project.id).toArray()).find(
    (i) => i.kind === 'scene',
  );
  if (!scene) throw new Error('The novel has no scene.');
  await writeItemUpdate(scene.id, sceneWith(['img-1']), 1);
  await db.images.add(imageRow('img-1', project.id));
  return { project, scene };
}

async function bytesOf(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

describe('The stored size (decision G2)', () => {
  test('keeps the shape and makes the long side 2,400 pixels', () => {
    expect(fitSize(4032, 3024)).toEqual({ width: MAX_IMAGE_SIDE, height: 1800 });
    expect(fitSize(3024, 4032)).toEqual({ width: 1800, height: MAX_IMAGE_SIDE });
    expect(fitSize(9000, 100)).toEqual({ width: MAX_IMAGE_SIDE, height: 27 });
  });

  test('keeps a small image as it is', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitSize(0, 0)).toEqual({ width: 1, height: 1 });
  });

  test('finds a transparent pixel, so the image stays a PNG', () => {
    expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
    expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 0]))).toBe(true);
  });
});

describe('The image node', () => {
  test('holds the id, the alt text, the caption, the width and the place, and no bytes', () => {
    const update = sceneWith(['img-1']);
    const json = updateToJson(update);
    const node = json.content?.find((n) => n.type === 'image');
    expect(imageAttrs(node?.attrs)).toEqual({
      id: 'img-1',
      alt: 'Boats in the harbour',
      decorative: false,
      caption: 'Port Isaac, 1962',
      width: 50,
      align: 'left',
    });
    expect(update.byteLength).toBeLessThan(400);
  });

  test('a wrong width or place reads as full width at the center', () => {
    expect(imageAttrs({ id: 'a', width: 40, align: 'top' })).toMatchObject({ width: 100, align: 'center' });
  });

  test('the ids in a text, and a copy with new ids', () => {
    const update = sceneWith(['img-1', 'img-2']);
    expect([...imageIdsIn(update)]).toEqual(['img-1', 'img-2']);
    const moved = remapImageIds(update, (old) => `${old}-copy`);
    expect([...imageIdsIn(moved)]).toEqual(['img-1-copy', 'img-2-copy']);
    // A text with no image is the same update.
    const plain = updateOf({ type: 'doc', content: [{ type: 'paragraph' }] }, 'prose');
    expect(remapImageIds(plain, (old) => `${old}-copy`)).toBe(plain);
  });

  test('raises the document schema, so an older build never drops an image', () => {
    expect(DOC_SCHEMA).toBe(10);
  });
});

describe('Backups with images (Task G1)', () => {
  test('an image round trips through a backup with the same bytes', async () => {
    const { project, scene } = await novelWithImage();
    const bytes = await writeBackup(await collectBackup(project.id, { music: false }));
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file('images/img-1')).not.toBeNull();
    const backup = await readBackup(bytes);
    await deleteProject(project.id);
    expect(await db.images.count()).toBe(0);
    await importBackup(backup, 'same');
    const row = await db.images.get('img-1');
    expect(row).toMatchObject({ projectId: project.id, type: 'image/jpeg', width: 1200, height: 800 });
    expect(await bytesOf(row?.data ?? new Blob())).toEqual([...BYTES]);
    expect([...imageIdsIn(await readItemUpdate(scene.id))]).toEqual(['img-1']);
  });

  test('a copy gives the image a new id in the row and in the text', async () => {
    const { project, scene } = await novelWithImage();
    const backup = await readBackup(await writeBackup(await collectBackup(project.id, { music: false })));
    const copyId = await importBackup(backup, 'copy');
    const copied = await db.images.where('projectId').equals(copyId).toArray();
    expect(copied).toHaveLength(1);
    const id = copied[0]?.id ?? '';
    expect(id).not.toBe('img-1');
    const copyScene = (await db.items.where('projectId').equals(copyId).toArray()).find(
      (i) => i.kind === 'scene' && i.title === scene.title,
    );
    expect([...imageIdsIn(await readItemUpdate(copyScene?.id ?? ''))]).toEqual([id]);
    // The original keeps its own row.
    expect((await db.images.get('img-1'))?.projectId).toBe(project.id);
  });

  test('a backup with a damaged image row fails the check', async () => {
    const { project } = await novelWithImage();
    const good = await writeBackup(await collectBackup(project.id, { music: false }));
    const change = async (edit: (zip: JSZip, manifest: Record<string, unknown>) => void) => {
      const zip = await JSZip.loadAsync(good);
      const manifest = JSON.parse((await zip.file('project.json')?.async('string')) ?? '{}') as Record<
        string,
        unknown
      >;
      edit(zip, manifest);
      zip.file('project.json', JSON.stringify(manifest));
      return zip.generateAsync({ type: 'uint8array' });
    };
    const first = (m: Record<string, unknown>): Record<string, unknown> =>
      (m.images as Record<string, unknown>[])[0] ?? {};
    const wrongType = await change((_, m) => {
      first(m).type = 'text/html';
    });
    await expect(readBackup(wrongType)).rejects.toThrow(/An image has a wrong type/);
    const wrongSize = await change((_, m) => {
      first(m).size = 99;
    });
    await expect(readBackup(wrongSize)).rejects.toThrow(/An image in the text is damaged/);
    const missing = await change((zip) => {
      zip.remove('images/img-1');
    });
    await expect(readBackup(missing)).rejects.toThrow(BackupError);
    const otherProject = await change((_, m) => {
      first(m).projectId = 'someone-else';
    });
    await expect(readBackup(otherProject)).rejects.toThrow(BackupError);
  });
});

describe('Storage (Review Focus 2)', () => {
  test('deleting a project deletes its images', async () => {
    const { project } = await novelWithImage();
    await db.images.add(imageRow('img-other', 'another-project'));
    await deleteProject(project.id);
    expect(await db.images.toCollection().primaryKeys()).toEqual(['img-other']);
  });

  test('the sweep removes an image that no text, snapshot or version holds, once a day has passed', async () => {
    const { project, scene } = await novelWithImage();
    await db.images.bulkAdd([
      imageRow('img-gone', project.id),
      imageRow('img-snapshot', project.id),
      imageRow('img-version', project.id),
      imageRow('img-new', project.id, IMAGE_GRACE_MS),
    ]);
    await db.snapshots.add({
      id: 'snap',
      projectId: project.id,
      itemId: scene.id,
      createdAt: 1,
      state: sceneWith(['img-snapshot']),
      text: '',
    });
    await db.itemVersions.add({
      id: 'version',
      projectId: project.id,
      itemId: scene.id,
      name: 'With the photo',
      createdAt: 1,
      updatedAt: 1,
      state: sceneWith(['img-version']),
      text: '',
    });
    expect([...(await imagesInUse(project.id))].sort()).toEqual(['img-1', 'img-snapshot', 'img-version']);
    clock.now = () => IMAGE_GRACE_MS + 10;
    expect(await sweepImages(project.id)).toBe(1);
    expect((await db.images.toCollection().primaryKeys()).sort()).toEqual([
      'img-1',
      'img-new',
      'img-snapshot',
      'img-version',
    ]);
    // Once the snapshot goes, so does its image.
    await db.snapshots.delete('snap');
    expect(await sweepImages(project.id)).toBe(1);
    expect(await db.images.count()).toBe(3);
  });

  test('the project page sweeps at most once a day', async () => {
    const { project } = await novelWithImage();
    await db.images.add(imageRow('img-gone', project.id));
    clock.now = () => IMAGE_GRACE_MS + 10;
    expect(await sweepImagesDaily(project.id)).toBe(1);
    await db.images.add(imageRow('img-gone-2', project.id));
    expect(await sweepImagesDaily(project.id)).toBe(0);
    clock.now = () => 2 * IMAGE_GRACE_MS + 20;
    expect(await sweepImagesDaily(project.id)).toBe(1);
    expect(await db.images.toCollection().primaryKeys()).toEqual(['img-1']);
  });
});

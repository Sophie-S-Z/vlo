import { liveQuery } from 'dexie';
import * as Y from 'yjs';
import { clock } from '@/lib/clock';
import { db, type ImageFile } from '@/lib/db';
import { newId } from '@/lib/ids';
import { readItemUpdates, YFRAGMENT } from '@/lib/ydocs';
import { prepareImage } from './resize';
import { sweepKey, unusedKey } from './sweepKey';

/*
 * The images in the text (Phase 16, Task G1). Each image is a row of the `images` table. The item's
 * document holds an `image` node with the row's id, the alt text, the caption, the width and the
 * alignment. The bytes never go in the document.
 */

/** The node name of an image in an item's document. */
export const IMAGE = 'image';

/**
 * An image row with no node in any item, snapshot or version stays this long before the sweep removes
 * it, so Undo in an open editor can still bring the image back.
 */
export const IMAGE_GRACE_MS = 24 * 60 * 60 * 1000;

/** The text that a failed image write shows (Global Constraints). */
export const IMAGE_FAILED = 'Vlo could not keep this image on this device.';

/** Makes the stored copy of an image file and adds its row. Returns the row. */
export async function addImage(projectId: string, file: Blob, id: string = newId()): Promise<ImageFile> {
  const prepared = await prepareImage(file);
  const row: ImageFile = {
    id,
    projectId,
    type: prepared.type,
    size: prepared.data.size,
    width: prepared.width,
    height: prepared.height,
    addedAt: clock.now(),
    data: prepared.data,
  };
  await db.images.add(row);
  return row;
}

// The ids of images whose write failed in this tab, so their node shows the failure.
const failed = new Set<string>();
const failListeners = new Set<() => void>();

export function markImageFailed(id: string): void {
  failed.add(id);
  for (const listener of failListeners) listener();
}

export function imageFailed(id: string): boolean {
  return failed.has(id);
}

export function onImageFailed(listener: () => void): () => void {
  failListeners.add(listener);
  return () => failListeners.delete(listener);
}

// One blob: address for each image row, made when its node first shows. The address lives as long as
// the tab, so an image that moves or comes back with Undo shows at once.
const addresses = new Map<string, { blob: Blob; url: string }>();

/** The blob: address of an image row's bytes. A changed row gets a new address. */
export function imageAddress(row: ImageFile): string {
  const known = addresses.get(row.id);
  if (known?.blob === row.data) return known.url;
  if (known) URL.revokeObjectURL(known.url);
  const url = URL.createObjectURL(row.data);
  addresses.set(row.id, { blob: row.data, url });
  return url;
}

/**
 * Watches the row of an image. `next` gets the row, or null while the row is not on this device (a
 * write in progress, a sync that has not brought it yet, or a lost row).
 */
export function watchImage(id: string, next: (row: ImageFile | null) => void): () => void {
  const subscription = liveQuery(() => db.images.get(id)).subscribe({
    next: (row) => {
      next(row ?? null);
    },
    error: () => {
      next(null);
    },
  });
  return () => {
    subscription.unsubscribe();
  };
}

function idsIn(node: Y.XmlFragment | Y.XmlElement, out: Set<string>): void {
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === IMAGE) {
      const id = child.getAttribute('id') as unknown;
      if (typeof id === 'string' && id !== '') out.add(id);
    }
    idsIn(child, out);
  }
}

/** The ids of the images in a Yjs update of an item, a snapshot or a version. */
export function imageIdsIn(update: Uint8Array, out = new Set<string>()): Set<string> {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    idsIn(doc.getXmlFragment(YFRAGMENT), out);
  } finally {
    doc.destroy();
  }
  return out;
}

function remapIn(node: Y.XmlFragment | Y.XmlElement, imageId: (old: string) => string): boolean {
  let changed = false;
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === IMAGE) {
      const old = child.getAttribute('id') as unknown;
      if (typeof old === 'string') {
        const next = imageId(old);
        if (next !== old) {
          child.setAttribute('id', next);
          changed = true;
        }
      }
    }
    if (remapIn(child, imageId)) changed = true;
  }
  return changed;
}

/** The update with each image node moved to a new image id, for a copy of a project. */
export function remapImageIds(update: Uint8Array, imageId: (old: string) => string): Uint8Array {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    const result = { changed: false };
    doc.transact(() => {
      result.changed = remapIn(doc.getXmlFragment(YFRAGMENT), imageId);
    });
    return result.changed ? Y.encodeStateAsUpdate(doc) : update;
  } finally {
    doc.destroy();
  }
}

/** The ids of every image that an item, a snapshot or a version of the project holds. */
export async function imagesInUse(projectId: string): Promise<Set<string>> {
  const itemIds = await db.items.where('projectId').equals(projectId).primaryKeys();
  const used = new Set<string>();
  // Each text is read on its own turn, so a large project does not stop the typing.
  for (const [, update] of await readItemUpdates(itemIds)) {
    imageIdsIn(update, used);
    await nextTurn();
  }
  const snapshots = await db.snapshots.where('projectId').equals(projectId).toArray();
  for (const snapshot of snapshots) {
    imageIdsIn(snapshot.state, used);
    await nextTurn();
  }
  const versions = await db.itemVersions.where('projectId').equals(projectId).toArray();
  for (const version of versions) {
    imageIdsIn(version.state, used);
    await nextTurn();
  }
  return used;
}

/** Lets the page handle its events before the work goes on. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** The time when a sweep first found each image unused, by image id. */
async function unusedSince(projectId: string): Promise<Record<string, number>> {
  const value = (await db.appMeta.get(unusedKey(projectId)))?.value;
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(value)) if (typeof at === 'number') out[id] = at;
  return out;
}

/**
 * Removes the image rows of the project that no item, snapshot or version holds any more. A row goes only
 * when it is older than `IMAGE_GRACE_MS` and an earlier sweep found it unused at least `IMAGE_GRACE_MS`
 * before. So a cut image on the clipboard, or a deleted image that Undo can put back, keeps its bytes for
 * a day. Returns how many it removed.
 */
export async function sweepImages(projectId: string): Promise<number> {
  const rows = await db.images.where('projectId').equals(projectId).toArray();
  const now = clock.now();
  const old = rows.filter((row) => now - row.addedAt >= IMAGE_GRACE_MS);
  const marks = await unusedSince(projectId);
  if (old.length === 0 && Object.keys(marks).length === 0) return 0;
  const used = await imagesInUse(projectId);
  const next: Record<string, number> = {};
  const gone: string[] = [];
  for (const row of old) {
    if (used.has(row.id)) continue;
    const since = marks[row.id];
    if (since === undefined) next[row.id] = now;
    else if (now - since >= IMAGE_GRACE_MS) gone.push(row.id);
    else next[row.id] = since;
  }
  await db.images.bulkDelete(gone);
  if (Object.keys(next).length === 0) await db.appMeta.delete(unusedKey(projectId));
  else await db.appMeta.put({ key: unusedKey(projectId), value: next });
  return gone.length;
}

/**
 * Sweeps the project's images at most once a day, because the sweep reads the text of every item. The
 * project page runs it a short time after the project opens.
 */
export async function sweepImagesDaily(projectId: string): Promise<number> {
  const key = sweepKey(projectId);
  const last = (await db.appMeta.get(key))?.value;
  if (typeof last === 'number' && clock.now() - last < IMAGE_GRACE_MS) return 0;
  const removed = await sweepImages(projectId);
  await db.appMeta.put({ key, value: clock.now() });
  return removed;
}

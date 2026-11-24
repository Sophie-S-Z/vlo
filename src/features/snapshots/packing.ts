import * as Y from 'yjs';
import { copyDocSchema } from '@/features/editor/docSchema';
import { gunzip, gzip } from '@/lib/crypto';
import type { Snapshot } from '@/lib/db';
import { YFRAGMENT } from '@/lib/ydocs';

type XmlNode = Y.XmlElement | Y.XmlText;

/** Copies of the children of an element, with no edit history. */
function copyChildren(from: Y.XmlFragment): XmlNode[] {
  return from.toArray().flatMap((node): XmlNode[] => {
    if (node instanceof Y.XmlText) {
      const text = new Y.XmlText();
      text.applyDelta(node.toDelta() as object[]);
      for (const [key, value] of Object.entries(node.getAttributes())) text.setAttribute(key, value);
      return [text];
    }
    // ProseMirror documents hold no XmlHook.
    if (!(node instanceof Y.XmlElement)) return [];
    const element = new Y.XmlElement(node.nodeName);
    for (const [key, value] of Object.entries(node.getAttributes()))
      if (value !== undefined) element.setAttribute(key, value);
    element.insert(0, copyChildren(node));
    return [element];
  });
}

/**
 * The text of an item and its schema version as one Yjs update, with no edit history. A snapshot or a
 * version never merges with the live text, so it needs only this. It takes about half the space of the
 * whole state of a text that the writer typed and changed.
 */
export function contentState(doc: Y.Doc): Uint8Array {
  const copy = new Y.Doc();
  try {
    copy.transact(() => {
      copy.getXmlFragment(YFRAGMENT).insert(0, copyChildren(doc.getXmlFragment(YFRAGMENT)));
      copyDocSchema(doc, copy);
    });
    return Y.encodeStateAsUpdate(copy);
  } finally {
    copy.destroy();
  }
}

/**
 * A snapshot's state in gzip, which takes about half the space on the device. A browser with no
 * CompressionStream keeps the state as it is.
 */
export async function pack(state: Uint8Array): Promise<Pick<Snapshot, 'state' | 'packed'>> {
  if (typeof CompressionStream === 'undefined') return { state };
  return { state: await gzip(new Uint8Array(state)), packed: true };
}

/** A snapshot's Yjs state as one update. */
export async function snapshotState(snapshot: Pick<Snapshot, 'state' | 'packed'>): Promise<Uint8Array> {
  return snapshot.packed ? gunzip(new Uint8Array(snapshot.state)) : snapshot.state;
}

/** The snapshot with its state as a plain Yjs update, as a backup file holds it. */
export async function unpackSnapshot(snapshot: Snapshot): Promise<Snapshot> {
  if (!snapshot.packed) return snapshot;
  const plain: Snapshot = { ...snapshot, state: await snapshotState(snapshot) };
  delete plain.packed;
  return plain;
}

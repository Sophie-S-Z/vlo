import * as Y from 'yjs';
import { DOC_SCHEMA } from './docSchema';

/** The origin for updates that came from another tab. */
export const TAB_ORIGIN = Symbol('another tab');

type TabMessage =
  | { type: 'hello' | 'here' | 'bye'; tab: string; schema?: number }
  | { type: 'update'; tab: string; update: Uint8Array };

/** Tabs that have the item open in a build with another document schema. */
export interface OtherVersions {
  /** Tabs with an older Vlo. Their editor can drop the new formats. */
  older: number;
  /** Tabs with a newer Vlo. This tab should reload. */
  newer: number;
}

/**
 * Shares one item's live edits with other tabs of this browser, and counts the tabs that have it open.
 * Yjs merges both sides, so no tab loses typing. Returns a function that stops sharing.
 *
 * Edits go only to tabs with the same document schema, on a channel named for that schema. An older
 * build would drop content it cannot show and send the loss back. Every build also says hello on the
 * Phase 1 channel, without edits, so each tab can count the tabs that run another version.
 */
export function shareWithTabs(
  itemId: string,
  doc: Y.Doc,
  ignore: unknown,
  onPeers: (count: number) => void,
  onOtherVersions: (versions: OtherVersions) => void = () => undefined,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const tab = crypto.randomUUID();
  const peers = new Set<string>();
  const others = new Map<string, number>();
  const channel = new BroadcastChannel(`vlo-item-${itemId}-s${String(DOC_SCHEMA)}`);
  // Phase 1 tabs use this name, and send no schema. Only presence goes here, never an edit.
  const presence = new BroadcastChannel(`vlo-item-${itemId}`);
  const post = (message: TabMessage) => {
    channel.postMessage(message);
  };
  const announce = (type: 'hello' | 'here' | 'bye') => {
    presence.postMessage({ type, tab, schema: DOC_SCHEMA } satisfies TabMessage);
  };

  channel.onmessage = (event: MessageEvent<TabMessage>) => {
    const message = event.data;
    if (message.tab === tab) return;
    if (message.type === 'update') {
      Y.applyUpdate(doc, message.update, TAB_ORIGIN);
      return;
    }
    if (message.type === 'bye') peers.delete(message.tab);
    else peers.add(message.tab);
    if (message.type === 'hello') {
      post({ type: 'here', tab });
      // The new tab may have loaded before this tab's last writes. Send the whole state once.
      post({ type: 'update', tab, update: Y.encodeStateAsUpdate(doc) });
    }
    onPeers(peers.size);
  };

  const reportOthers = () => {
    let older = 0;
    let newer = 0;
    for (const schema of others.values()) {
      if (schema < DOC_SCHEMA) older += 1;
      else newer += 1;
    }
    onOtherVersions({ older, newer });
  };

  presence.onmessage = (event: MessageEvent<TabMessage>) => {
    const message = event.data;
    // Edits from an older tab never apply here. Same-version tabs meet on the schema channel.
    if (message.tab === tab || message.type === 'update') return;
    const schema = typeof message.schema === 'number' ? message.schema : 1;
    if (schema === DOC_SCHEMA) return;
    if (message.type === 'bye') others.delete(message.tab);
    else others.set(message.tab, schema);
    if (message.type === 'hello') announce('here');
    reportOthers();
  };

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === TAB_ORIGIN || origin === ignore) return;
    post({ type: 'update', tab, update });
  };
  doc.on('update', onUpdate);
  post({ type: 'hello', tab });
  announce('hello');

  // A closed tab never runs React clean-up, so it says goodbye on pagehide. A page restored from the back-forward cache says hello again.
  const onPageHide = () => {
    post({ type: 'bye', tab });
    announce('bye');
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    // A tab that closed while this page was in the cache said goodbye to no one here, so each tab counts
    // again from its answer to the hello.
    peers.clear();
    others.clear();
    onPeers(0);
    reportOthers();
    post({ type: 'hello', tab });
    announce('hello');
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  return () => {
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    doc.off('update', onUpdate);
    post({ type: 'bye', tab });
    announce('bye');
    channel.close();
    presence.close();
  };
}

/**
 * Sends a change made outside the editor, such as "Mark all", to every tab that has the item open,
 * this tab too. Yjs merges it with the edits there.
 */
export function sendToTabs(itemId: string, update: Uint8Array): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(`vlo-item-${itemId}-s${String(DOC_SCHEMA)}`);
  channel.postMessage({ type: 'update', tab: crypto.randomUUID(), update } satisfies TabMessage);
  channel.close();
}

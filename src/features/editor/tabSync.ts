import * as Y from 'yjs';

/** The origin for updates that came from another tab. */
export const TAB_ORIGIN = Symbol('another tab');

type TabMessage =
  { type: 'hello' | 'here' | 'bye'; tab: string } | { type: 'update'; tab: string; update: Uint8Array };

/**
 * Shares one item's live edits with other tabs of this browser, and counts the tabs that have it open.
 * Yjs merges both sides, so no tab loses typing. Returns a function that stops sharing.
 */
export function shareWithTabs(
  itemId: string,
  doc: Y.Doc,
  ignore: unknown,
  onPeers: (count: number) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const tab = crypto.randomUUID();
  const peers = new Set<string>();
  const channel = new BroadcastChannel(`vlo-item-${itemId}`);
  const post = (message: TabMessage) => {
    channel.postMessage(message);
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

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === TAB_ORIGIN || origin === ignore) return;
    post({ type: 'update', tab, update });
  };
  doc.on('update', onUpdate);
  post({ type: 'hello', tab });

  // A closed tab never runs React clean-up, so it says goodbye on pagehide. A page restored from the back-forward cache says hello again.
  const onPageHide = () => {
    post({ type: 'bye', tab });
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) post({ type: 'hello', tab });
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  return () => {
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    doc.off('update', onUpdate);
    post({ type: 'bye', tab });
    channel.close();
  };
}

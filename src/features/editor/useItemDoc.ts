import { useEffect, useState } from 'react';
import { openItemDoc, type OpenItemDoc } from '@/lib/ydocs';
import { shareWithTabs } from './tabSync';

export type ItemDocState =
  | { status: 'loading'; open: null; otherTabs: 0 }
  | { status: 'ready'; open: OpenItemDoc; otherTabs: number }
  | { status: 'error'; open: null; otherTabs: 0 };

/** Loads only this item's Yjs document, shares it with other tabs, and closes it on unmount. Key the caller by item id. */
export function useItemDoc(itemId: string): ItemDocState {
  const [state, setState] = useState<ItemDocState>({ status: 'loading', open: null, otherTabs: 0 });

  useEffect(() => {
    let cancelled = false;
    let stopSharing: () => void = () => undefined;
    const open = openItemDoc(itemId);
    open.ready.then(
      () => {
        if (cancelled) return;
        setState({ status: 'ready', open, otherTabs: 0 });
        stopSharing = shareWithTabs(itemId, open.doc, open.persistence, (otherTabs) => {
          if (!cancelled) setState({ status: 'ready', open, otherTabs });
        });
      },
      () => {
        if (!cancelled) setState({ status: 'error', open: null, otherTabs: 0 });
      },
    );
    return () => {
      cancelled = true;
      stopSharing();
      void open.close();
    };
  }, [itemId]);

  return state;
}

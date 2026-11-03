import { useEffect, useState } from 'react';
import { openItemDoc, type OpenItemDoc } from '@/lib/ydocs';
import { DOC_SCHEMA, docSchema, stampDocSchema } from './docSchema';
import { shareWithTabs, TAB_ORIGIN, type OtherVersions } from './tabSync';

const NO_OTHERS: OtherVersions = { older: 0, newer: 0 };

export type ItemDocState =
  | { status: 'loading'; open: null; otherTabs: 0; otherVersions: OtherVersions }
  | { status: 'ready'; open: OpenItemDoc; otherTabs: number; otherVersions: OtherVersions }
  /** A newer Vlo saved this item. This build would drop what it cannot show, so it does not open it. */
  | { status: 'newer'; open: null; otherTabs: 0; otherVersions: OtherVersions }
  | { status: 'error'; open: null; otherTabs: 0; otherVersions: OtherVersions };

/** Loads only this item's Yjs document, shares it with other tabs, and closes it on unmount. Key the caller by item id. */
export function useItemDoc(itemId: string): ItemDocState {
  const [state, setState] = useState<ItemDocState>({
    status: 'loading',
    open: null,
    otherTabs: 0,
    otherVersions: NO_OTHERS,
  });

  useEffect(() => {
    let cancelled = false;
    let stopSharing: () => void = () => undefined;
    let stopStamping: () => void = () => undefined;
    const open = openItemDoc(itemId);
    open.ready.then(
      () => {
        if (cancelled) return;
        if (docSchema(open.doc) > DOC_SCHEMA) {
          setState({ status: 'newer', open: null, otherTabs: 0, otherVersions: NO_OTHERS });
          return;
        }
        // The first change the writer makes records this build's schema in the document.
        const stamp = (_update: Uint8Array, origin: unknown) => {
          if (origin === open.persistence || origin === TAB_ORIGIN) return;
          if (docSchema(open.doc) < DOC_SCHEMA) stampDocSchema(open.doc);
        };
        open.doc.on('update', stamp);
        stopStamping = () => {
          open.doc.off('update', stamp);
        };
        let otherTabs = 0;
        let otherVersions = NO_OTHERS;
        const publish = () => {
          if (!cancelled) setState({ status: 'ready', open, otherTabs, otherVersions });
        };
        publish();
        stopSharing = shareWithTabs(
          itemId,
          open.doc,
          open.persistence,
          (count) => {
            otherTabs = count;
            publish();
          },
          (versions) => {
            otherVersions = versions;
            publish();
          },
        );
      },
      () => {
        if (!cancelled) setState({ status: 'error', open: null, otherTabs: 0, otherVersions: NO_OTHERS });
      },
    );
    return () => {
      cancelled = true;
      stopStamping();
      stopSharing();
      void open.close();
    };
  }, [itemId]);

  return state;
}

import * as Y from 'yjs';
import { afterEach, expect, test, vi } from 'vitest';
import { shareWithTabs } from '@/features/editor/tabSync';

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

function tab(itemId: string) {
  const doc = new Y.Doc();
  const onPeers = vi.fn<(count: number) => void>();
  stops.push(shareWithTabs(itemId, doc, 'database load', onPeers));
  return { doc, onPeers };
}

const lastPeers = (onPeers: ReturnType<typeof tab>['onPeers']) => onPeers.mock.lastCall?.[0];

test('two tabs of one item see each other and share edits', async () => {
  const a = tab('item-1');
  const b = tab('item-1');
  await vi.waitFor(() => {
    expect(lastPeers(a.onPeers)).toBe(1);
    expect(lastPeers(b.onPeers)).toBe(1);
  });
  a.doc.getText('t').insert(0, 'salt');
  await vi.waitFor(() => {
    expect(b.doc.getText('t').toJSON()).toBe('salt');
  });
});

test('a tab that closes says goodbye on pagehide, and says hello again when restored', async () => {
  const a = tab('item-2');
  tab('item-2');
  await vi.waitFor(() => {
    expect(lastPeers(a.onPeers)).toBe(1);
  });
  window.dispatchEvent(new Event('pagehide'));
  await vi.waitFor(() => {
    expect(lastPeers(a.onPeers)).toBe(0);
  });
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  await vi.waitFor(() => {
    expect(lastPeers(a.onPeers)).toBe(1);
  });
});

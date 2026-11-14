import * as Y from 'yjs';
import { afterEach, expect, test, vi } from 'vitest';
import { DOC_SCHEMA, docSchema, stampDocSchema } from '@/features/editor/docSchema';
import { shareWithTabs, type OtherVersions } from '@/features/editor/tabSync';

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

test('a tab that closed while this page was in the back-forward cache is not counted after it comes back', async () => {
  const a = tab('item-5');
  // A tab of the same build that answers once, then closes with no goodbye that this page can hear.
  const gone = new BroadcastChannel(`vlo-item-item-5-s${String(DOC_SCHEMA)}`);
  gone.postMessage({ type: 'here', tab: 'gone-tab' });
  await vi.waitFor(() => {
    expect(lastPeers(a.onPeers)).toBe(1);
  });
  gone.close();
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  await vi.waitFor(() => {
    expect(lastPeers(a.onPeers)).toBe(0);
  });
});

test('a Phase 1 tab is counted as an older version and never gets or gives edits', async () => {
  const onVersions = vi.fn<(v: OtherVersions) => void>();
  const doc = new Y.Doc();
  stops.push(shareWithTabs('item-3', doc, 'database load', vi.fn(), onVersions));
  // A Phase 1 tab speaks on the old channel name and sends no schema.
  const old = new BroadcastChannel('vlo-item-item-3');
  const heard: { type: string }[] = [];
  old.onmessage = (event: MessageEvent<{ type: string }>) => {
    heard.push(event.data);
  };
  const oldDoc = new Y.Doc();
  oldDoc.getText('t').insert(0, 'old');
  old.postMessage({ type: 'hello', tab: 'old-tab' });
  old.postMessage({ type: 'update', tab: 'old-tab', update: Y.encodeStateAsUpdate(oldDoc) });
  await vi.waitFor(() => {
    expect(onVersions.mock.lastCall?.[0]).toEqual({ older: 1, newer: 0 });
  });
  doc.getText('t').insert(0, 'new');
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(doc.getText('t').toJSON()).toBe('new');
  expect(heard.some((m) => m.type === 'update')).toBe(false);
  old.postMessage({ type: 'bye', tab: 'old-tab' });
  await vi.waitFor(() => {
    expect(onVersions.mock.lastCall?.[0]).toEqual({ older: 0, newer: 0 });
  });
  old.close();
});

test('the document schema is stamped once and read back, and Phase 1 documents count as 1', () => {
  const doc = new Y.Doc();
  expect(docSchema(doc)).toBe(1);
  stampDocSchema(doc);
  expect(docSchema(doc)).toBe(DOC_SCHEMA);
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  expect(docSchema(copy)).toBe(DOC_SCHEMA);
  copy.getMap('vlo').set('schema', 'x');
  expect(docSchema(copy)).toBe(1);
});

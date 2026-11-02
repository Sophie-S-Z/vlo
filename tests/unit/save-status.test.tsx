import { act, cleanup, render, screen } from '@testing-library/react';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SaveStatus } from '@/features/editor/SaveStatus';
import { trackSaves, type SaveState } from '@/features/editor/saveTracker';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function type(doc: Y.Doc, text: string, origin: unknown = null) {
  doc.transact(() => {
    doc.getText('t').insert(0, text);
  }, origin);
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

test('saving on each change, saved 600 ms after the last one once storage confirms', async () => {
  const doc = new Y.Doc();
  const states: SaveState[] = [];
  const confirm = vi.fn(() => Promise.resolve());
  const onPause = vi.fn(() => Promise.resolve());
  trackSaves({ doc, ignoreOrigins: [], confirm, onPause, onState: (s) => states.push(s) });
  type(doc, 'a');
  vi.advanceTimersByTime(400);
  type(doc, 'b');
  vi.advanceTimersByTime(599);
  expect(confirm).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  await flush();
  expect(onPause).toHaveBeenCalledTimes(1);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(states).toEqual(['saving', 'saving', 'saved']);
});

test('a write rejected with QuotaExceededError gives error-quota', async () => {
  const doc = new Y.Doc();
  let state: SaveState = 'saved';
  trackSaves({
    doc,
    ignoreOrigins: [],
    confirm: () => Promise.reject(new DOMException('full', 'QuotaExceededError')),
    onState: (s) => (state = s),
  });
  type(doc, 'a');
  vi.advanceTimersByTime(600);
  await flush();
  expect(state).toBe('error-quota');
  expect(doc.getText('t').toJSON()).toBe('a');
});

test('another failure gives error', async () => {
  const doc = new Y.Doc();
  let state: SaveState = 'saved';
  trackSaves({
    doc,
    ignoreOrigins: [],
    confirm: () => Promise.reject(new Error('x')),
    onState: (s) => (state = s),
  });
  type(doc, 'a');
  vi.advanceTimersByTime(600);
  await flush();
  expect(state).toBe('error');
});

test('updates from the database load or another tab do not count as typing', () => {
  const doc = new Y.Doc();
  const states: SaveState[] = [];
  const load = {};
  trackSaves({
    doc,
    ignoreOrigins: [load],
    confirm: () => Promise.resolve(),
    onState: (s) => states.push(s),
  });
  type(doc, 'a', load);
  expect(states).toEqual([]);
});

test('stopping during the pause still runs the pause work', () => {
  const doc = new Y.Doc();
  const onPause = vi.fn(() => Promise.resolve());
  const stop = trackSaves({
    doc,
    ignoreOrigins: [],
    confirm: () => Promise.resolve(),
    onPause,
    onState: () => undefined,
  });
  type(doc, 'a');
  stop();
  expect(onPause).toHaveBeenCalledTimes(1);
});

test.each([
  ['saved', 'Saved'],
  ['error-quota', 'Vlo could not save. Your device storage is full.'],
  ['error', 'Vlo could not save. Reload Vlo and try again.'],
] as const)('the status region says %s', (state, message) => {
  render(<SaveStatus state={state} />);
  expect(screen.getByRole('status').textContent).toBe(message);
});

test('the status region stays quiet while saving, so typing is not read aloud', () => {
  render(<SaveStatus state="saving" />);
  expect(screen.getByRole('status').textContent).toBe('');
});

test('a page that hides during the pause writes the text copy and confirms the save', async () => {
  const doc = new Y.Doc();
  const states: SaveState[] = [];
  const onPause = vi.fn(() => Promise.resolve());
  const confirm = vi.fn(() => Promise.resolve());
  trackSaves({ doc, ignoreOrigins: [], confirm, onPause, onState: (s) => states.push(s) });
  type(doc, 'a');
  window.dispatchEvent(new Event('pagehide'));
  await flush();
  expect(onPause).toHaveBeenCalledTimes(1);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(states).toEqual(['saving', 'saved']);
  vi.advanceTimersByTime(600);
  await flush();
  expect(onPause).toHaveBeenCalledTimes(1);
});

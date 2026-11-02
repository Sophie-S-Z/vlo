import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { StorageHealth } from '@/features/settings/StorageHealth';
import { db } from '@/lib/db';

function fakeStorage(storage: Partial<StorageManager>) {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
}

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  cleanup();
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
});

test('shows use, quota and protection', async () => {
  fakeStorage({
    estimate: () => Promise.resolve({ usage: 2048, quota: 1024 * 1024 }),
    persisted: () => Promise.resolve(true),
  });
  render(<StorageHealth />);
  expect(await screen.findByText('2.0 KB')).toBeTruthy();
  expect(screen.getByText('1.0 MB')).toBeTruthy();
  expect(screen.getByText('Yes. The browser keeps Vlo data when space runs low.')).toBeTruthy();
});

test('says so when the browser declined protection', async () => {
  await db.appMeta.put({ key: 'persistence', value: 'denied' });
  fakeStorage({
    estimate: () => Promise.resolve({ usage: 0, quota: 0 }),
    persisted: () => Promise.resolve(false),
  });
  render(<StorageHealth />);
  expect(
    await screen.findByText(
      'No. The browser declined. It may clear Vlo data when space runs low, so back up often.',
    ),
  ).toBeTruthy();
});

test('before the first project, says when Vlo asks', async () => {
  fakeStorage({
    estimate: () => Promise.resolve({ usage: 0, quota: 0 }),
    persisted: () => Promise.resolve(false),
  });
  render(<StorageHealth />);
  expect(
    await screen.findByText('Not yet. Vlo asks for protection when you create your first project.'),
  ).toBeTruthy();
});

test('shows "Unknown" when the browser refuses to report', async () => {
  fakeStorage({
    estimate: () => Promise.reject(new Error('no')),
    persisted: () => Promise.reject(new Error('no')),
  });
  render(<StorageHealth />);
  expect(await screen.findAllByText('Unknown')).toHaveLength(3);
});

import { afterEach, describe, expect, test, vi } from 'vitest';
import { localStore } from '@/app/localStore';

/* The one store that keeps each device setting (sound, focus, grammar, parts of speech, stats bar, toolbar). */

const KEY = 'vlo:test-store';
const clean = (raw: unknown) => ({ on: (raw as { on?: unknown } | null)?.on === true });

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('localStore', () => {
  test('a missing or damaged value gives the defaults', () => {
    expect(localStore(KEY, clean).get()).toEqual({ on: false });
    localStorage.setItem(KEY, '{not json');
    expect(localStore(KEY, clean).get()).toEqual({ on: false });
  });

  test('set keeps the value, tells each listener, and a new page reads it back', () => {
    const store = localStore(KEY, clean);
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    store.set({ on: true });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(localStore(KEY, clean).get()).toEqual({ on: true });
    stop();
    store.set({ on: false });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  test('a browser that refuses storage keeps the value until the page closes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const store = localStore(KEY, clean);
    store.set({ on: true });
    expect(store.get()).toEqual({ on: true });
  });

  test('reload reads the stored value again', () => {
    const store = localStore(KEY, clean);
    localStorage.setItem(KEY, JSON.stringify({ on: true }));
    store.reload();
    expect(store.get()).toEqual({ on: true });
  });
});

test('a change in another tab reaches this tab, so this tab never writes back an old copy', () => {
  const store = localStore(KEY, clean);
  localStorage.setItem(KEY, JSON.stringify({ on: true }));
  window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
  expect(store.get()).toEqual({ on: true });
});

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { ASK_AGAIN_MS, PERSISTENCE_KEY, renewPersistence } from '@/lib/storage';

let asks = 0;
let persisted = false;
let permission: PermissionState = 'prompt';
const realNow = clock.now.bind(clock);

function fakeBrowser(answer: boolean) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      persisted: () => Promise.resolve(persisted),
      persist: () => {
        asks += 1;
        return Promise.resolve(answer);
      },
    },
  });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: () => Promise.resolve({ state: permission }) },
  });
}

const answer = async () => (await db.appMeta.get(PERSISTENCE_KEY))?.value;

beforeEach(async () => {
  await db.open();
  asks = 0;
  persisted = false;
  permission = 'prompt';
  fakeBrowser(true);
});
afterEach(async () => {
  clock.now = realNow;
  Reflect.deleteProperty(navigator, 'storage');
  Reflect.deleteProperty(navigator, 'permissions');
  await db.delete();
});

describe('renewPersistence', () => {
  test('asks again after an earlier "denied", and keeps the new answer', async () => {
    await db.appMeta.put({ key: PERSISTENCE_KEY, value: 'denied' });
    await renewPersistence();
    expect(asks).toBe(1);
    expect(await answer()).toBe('granted');
  });

  test('asks at most once in a week', async () => {
    fakeBrowser(false);
    await db.appMeta.put({ key: PERSISTENCE_KEY, value: 'denied' });
    clock.now = () => 1_000_000;
    await renewPersistence();
    clock.now = () => 1_000_000 + ASK_AGAIN_MS - 1;
    await renewPersistence();
    expect(asks).toBe(1);
    clock.now = () => 1_000_000 + ASK_AGAIN_MS;
    await renewPersistence();
    expect(asks).toBe(2);
  });

  test('does not ask before the first project asked', async () => {
    await renewPersistence();
    expect(asks).toBe(0);
    expect(await answer()).toBeUndefined();
  });

  test('does not ask when the writer blocked the request', async () => {
    await db.appMeta.put({ key: PERSISTENCE_KEY, value: 'denied' });
    permission = 'denied';
    await renewPersistence();
    expect(asks).toBe(0);
  });

  test('only records the answer when the data is already protected', async () => {
    await db.appMeta.put({ key: PERSISTENCE_KEY, value: 'denied' });
    persisted = true;
    await renewPersistence();
    expect(asks).toBe(0);
    expect(await answer()).toBe('granted');
  });

  test('does nothing in a browser with no StorageManager', async () => {
    Reflect.deleteProperty(navigator, 'storage');
    await db.appMeta.put({ key: PERSISTENCE_KEY, value: 'unsupported' });
    await expect(renewPersistence()).resolves.toBeUndefined();
    expect(await answer()).toBe('unsupported');
  });
});

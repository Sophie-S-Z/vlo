import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { watchActiveMinutes } from '@/features/snapshots/autoSnapshot';
import { clock } from '@/lib/clock';

const MINUTE = 60_000;
const realNow = clock.now.bind(clock);
let now = 0;
let doc: Y.Doc;
let text = '';
let saved: string[] = [];
let stop: () => void;
let active: Set<number>;
let failNext = false;
let errors: unknown[] = [];

function start(latest: string | null = null) {
  stop = watchActiveMinutes({
    doc,
    active,
    onError: (error) => errors.push(error),
    ignoreOrigins: ['load'],
    everyMinutes: 10,
    readText: () => text,
    latestText: () => Promise.resolve(saved.at(-1) ?? latest),
    save: (t) => {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('QuotaExceededError'));
      }
      saved.push(t);
      return Promise.resolve();
    },
  });
}

/** Types one character, then lets one minute pass. */
async function typeForAMinute(origin: unknown = null) {
  doc.transact(() => {
    doc.getText('t').insert(0, 'a');
  }, origin);
  text = doc.getText('t').toJSON();
  await vi.advanceTimersByTimeAsync(MINUTE);
  now += MINUTE;
}

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  clock.now = () => now;
  doc = new Y.Doc();
  text = '';
  saved = [];
  active = new Set();
  failNext = false;
  errors = [];
});
afterEach(() => {
  stop();
  clock.now = realNow;
  vi.useRealTimers();
});

test('after 10 active minutes with a change, a snapshot appears', async () => {
  start();
  for (let i = 0; i < 9; i += 1) await typeForAMinute();
  expect(saved).toEqual([]);
  await typeForAMinute();
  expect(saved).toEqual(['a'.repeat(10)]);
});

test('idle minutes do not count', async () => {
  start();
  for (let i = 0; i < 5; i += 1) await typeForAMinute();
  await vi.advanceTimersByTimeAsync(10 * MINUTE);
  now += 10 * MINUTE;
  for (let i = 0; i < 4; i += 1) await typeForAMinute();
  expect(saved).toEqual([]);
  await typeForAMinute();
  expect(saved).toHaveLength(1);
});

test('loads and other tabs do not count as editing', async () => {
  start();
  for (let i = 0; i < 12; i += 1) await typeForAMinute('load');
  expect(saved).toEqual([]);
});

test('no change since the newest snapshot adds none', async () => {
  text = 'kept';
  stop = watchActiveMinutes({
    doc,
    active,
    ignoreOrigins: [],
    everyMinutes: 10,
    readText: () => 'kept',
    latestText: () => Promise.resolve('kept'),
    save: (t) => {
      saved.push(t);
      return Promise.resolve();
    },
  });
  for (let i = 0; i < 12; i += 1) await typeForAMinute();
  expect(saved).toEqual([]);
});

test('the count adds up across editors on the same item', async () => {
  start();
  for (let i = 0; i < 6; i += 1) await typeForAMinute();
  stop();
  // The writer opens another item, then comes back: a new watcher gets the same set.
  start();
  for (let i = 0; i < 3; i += 1) await typeForAMinute();
  expect(saved).toEqual([]);
  await typeForAMinute();
  expect(saved).toHaveLength(1);
});

test('a failed save is reported and keeps the minutes for the next try', async () => {
  start();
  failNext = true;
  for (let i = 0; i < 10; i += 1) await typeForAMinute();
  expect(saved).toEqual([]);
  expect(errors).toHaveLength(1);
  expect(active.size).toBe(10);
  // The next pause tries again without ten more minutes.
  await typeForAMinute();
  expect(saved).toHaveLength(1);
  expect(active.size).toBe(0);
});

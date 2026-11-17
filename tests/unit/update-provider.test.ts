import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { checkHourly, UPDATE_CHECK_MS, whenSettled } from '@/app/UpdateProvider';

let stop: () => void = () => undefined;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('asks the service worker for a new version every hour while online', () => {
  const registration = { update: vi.fn(() => Promise.resolve()) };
  stop = checkHourly(registration);
  vi.advanceTimersByTime(UPDATE_CHECK_MS - 1);
  expect(registration.update).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(registration.update).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(UPDATE_CHECK_MS);
  expect(registration.update).toHaveBeenCalledTimes(2);
});

test('skips the check while offline', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const registration = { update: vi.fn(() => Promise.resolve()) };
  stop = checkHourly(registration);
  vi.advanceTimersByTime(UPDATE_CHECK_MS * 3);
  expect(registration.update).not.toHaveBeenCalled();
});

test('asks for the new version only after the fonts load and the page goes idle', async () => {
  let fontsLoaded: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    fontsLoaded = resolve;
  });
  vi.stubGlobal('requestIdleCallback', (run: () => void) => setTimeout(run, 10));
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
  let settled = false;
  void whenSettled().then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(5000);
  expect(settled).toBe(false);
  fontsLoaded();
  await vi.advanceTimersByTimeAsync(9);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toBe(true);
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fonts');
});

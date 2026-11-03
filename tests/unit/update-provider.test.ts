import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { checkHourly, UPDATE_CHECK_MS } from '@/app/UpdateProvider';

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

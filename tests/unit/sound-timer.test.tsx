import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useMinutesLeft } from '@/features/sound/SoundPanel';

/* Code review: the sleep timer shows its own minutes from the moment it is set. */

afterEach(() => {
  vi.useRealTimers();
});

test('a timer set long after the panel opened shows its own minutes', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ endsAt }) => useMinutesLeft(endsAt), {
    initialProps: { endsAt: null as number | null },
  });
  // An hour later, the writer sets a 15-minute timer.
  act(() => {
    vi.advanceTimersByTime(60 * 60_000);
  });
  rerender({ endsAt: Date.now() + 15 * 60_000 });
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(result.current).toBe(15);
});

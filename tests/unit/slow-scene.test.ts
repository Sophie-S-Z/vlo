import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  framesTooSlow,
  isSceneSlow,
  markSceneSlow,
  retrySceneMotion,
  SAMPLE_MS,
  SLOW_FRAME_MS,
  WARM_UP_MS,
  watchSceneFrames,
} from '@/features/scenes/slowScene';

describe('the slow scene guard', () => {
  test('the middle frame gap decides, so one long frame does not count', () => {
    expect(framesTooSlow([16, 17, 16, 400, 17])).toBe(false);
    expect(framesTooSlow([16, 300, 320, 330, 17])).toBe(true);
    expect(framesTooSlow([SLOW_FRAME_MS, SLOW_FRAME_MS])).toBe(false);
    expect(framesTooSlow([SLOW_FRAME_MS + 1])).toBe(true);
    // No frame at all in the whole sample is the slowest case.
    expect(framesTooSlow([])).toBe(true);
  });

  test('marking and retrying change the shared state', () => {
    retrySceneMotion();
    expect(isSceneSlow()).toBe(false);
    markSceneSlow();
    expect(isSceneSlow()).toBe(true);
    retrySceneMotion();
    expect(isSceneSlow()).toBe(false);
  });

  describe('timing the frames', () => {
    let now = 0;
    let frameMs = 16;
    beforeEach(() => {
      now = 0;
      vi.useFakeTimers();
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) =>
        setTimeout(() => {
          now += frameMs;
          run(now);
        }, frameMs),
      );
      vi.stubGlobal('cancelAnimationFrame', (id: number) => {
        clearTimeout(id);
      });
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    const run = (ms: number) => {
      // The fake clock moves with the timers, so warm-up time counts too.
      for (let t = 0; t < ms; t += 4) {
        vi.advanceTimersByTime(4);
        now = Math.max(now, t);
      }
    };

    test('fast frames never call it slow', () => {
      frameMs = 16;
      const onSlow = vi.fn();
      watchSceneFrames(onSlow);
      run(WARM_UP_MS + SAMPLE_MS + 500);
      expect(onSlow).not.toHaveBeenCalled();
    });

    test('slow frames call it slow once the sample ends', () => {
      frameMs = 300;
      const onSlow = vi.fn();
      watchSceneFrames(onSlow);
      run(WARM_UP_MS + SAMPLE_MS + 1000);
      expect(onSlow).toHaveBeenCalledTimes(1);
    });

    test('a scene that stops moving first is never judged', () => {
      frameMs = 300;
      const onSlow = vi.fn();
      const stop = watchSceneFrames(onSlow);
      run(WARM_UP_MS + 500);
      stop();
      run(SAMPLE_MS + 1000);
      expect(onSlow).not.toHaveBeenCalled();
    });
  });
});

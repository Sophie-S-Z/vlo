import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createArt, seeded, STILL_TIME, type Ctx } from '@/features/scenes/art';
import { SCENE_FPS, SceneRunner, type Schedule } from '@/features/scenes/runner';
import { cleanScene, NO_SCENE, SCENES, sceneInfo, type SceneId } from '@/features/scenes/scenes';

/*
 * Cozy scenes (plan Task A8). jsdom has no canvas, so these tests draw on a recording 2D context. They check
 * the scene list, the stored value, the art for every scene, and the runner's frame timing.
 */

interface Call {
  name: string;
  args: unknown[];
}

/** A 2D context that records each method call and accepts every property write. */
function recordingContext(calls: Call[]): Ctx {
  const gradient = { addColorStop: () => undefined };
  const state: Record<string | symbol, unknown> = {};
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ name: String(key), args });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return gradient;
        return undefined;
      };
    },
    set(target, key, value) {
      target[key] = value;
      calls.push({ name: `set ${String(key)}`, args: [value] });
      return true;
    },
  }) as unknown as Ctx;
}

const stillCalls: Call[] = [];

class FakeOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return recordingContext(stillCalls);
  }
}

beforeEach(() => {
  stillCalls.length = 0;
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the scene list', () => {
  it('has six scenes with unique ids, a label, a hint, a still and a sound', () => {
    expect(SCENES).toHaveLength(6);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(6);
    for (const scene of SCENES) {
      expect(scene.label.length).toBeGreaterThan(0);
      expect(scene.hint).toMatch(/\.$/);
      expect(scene.still).toMatch(/gradient\(/);
      expect(['rain', 'fire', 'crickets', 'forest', 'wind', 'waves']).toContain(scene.sound);
    }
  });

  it('finds a scene by id and throws for an unknown id', () => {
    expect(sceneInfo('ocean').label).toBe('Ocean at dusk');
    expect(() => sceneInfo('volcano' as SceneId)).toThrow(/Unknown scene/);
  });

  it('keeps a known stored scene and turns anything else into no scene', () => {
    expect(cleanScene('forest')).toBe('forest');
    expect(cleanScene('none')).toBe(NO_SCENE);
    expect(cleanScene(undefined)).toBe(NO_SCENE);
    expect(cleanScene('Forest')).toBe(NO_SCENE);
    expect(cleanScene(3)).toBe(NO_SCENE);
    expect(cleanScene('__proto__')).toBe(NO_SCENE);
  });
});

describe('seeded', () => {
  it('gives the same numbers for the same seed, all from 0 up to 1', () => {
    const a = seeded(42);
    const b = seeded(42);
    const first = Array.from({ length: 200 }, () => a());
    expect(Array.from({ length: 200 }, () => b())).toEqual(first);
    for (const n of first) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
    expect(new Set(first).size).toBeGreaterThan(190);
  });

  it('gives other numbers for another seed', () => {
    expect(seeded(1)()).not.toBe(seeded(2)());
  });
});

describe('the art', () => {
  it.each(SCENES.map((s) => s.id))('%s paints its still parts once per size and draws each frame', (id) => {
    const frame: Call[] = [];
    const art = createArt(id, recordingContext(frame));
    art.resize(1200.4, 800.6);
    const stillCount = stillCalls.length;
    expect(stillCount).toBeGreaterThan(5);

    for (const t of [0, STILL_TIME, 100.25]) {
      frame.length = 0;
      art.draw(t);
      // Each frame starts from the cached still parts at the top left.
      expect(frame[0]).toMatchObject({ name: 'drawImage' });
      expect(frame[0]?.args.slice(1)).toEqual([0, 0]);
      expect(frame.length).toBeGreaterThan(5);
      for (const call of frame) {
        for (const arg of call.args) {
          if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
        }
      }
    }
    // Frames do not paint the still parts again.
    expect(stillCalls.length).toBe(stillCount);
  });

  it.each(SCENES.map((s) => s.id))('%s draws the same still frame each time', (id) => {
    const record = () => {
      const frame: Call[] = [];
      const art = createArt(id, recordingContext(frame));
      art.resize(640, 480);
      frame.length = 0;
      art.draw(STILL_TIME);
      return JSON.stringify(frame.map((c) => [c.name, c.args.filter((a) => typeof a !== 'object')]));
    };
    expect(record()).toBe(record());
  });

  it.each(SCENES.map((s) => s.id))('%s draws at a phone size without a bad number', (id) => {
    const frame: Call[] = [];
    const art = createArt(id, recordingContext(frame));
    art.resize(1, 1);
    art.resize(360, 640);
    art.draw(3.3);
    const numbers = frame.flatMap((c) => c.args).filter((a): a is number => typeof a === 'number');
    expect(numbers.every((n) => Number.isFinite(n))).toBe(true);
  });
});

describe('SceneRunner', () => {
  /** A schedule that runs frames only when the test says so. */
  function manualSchedule() {
    const queue: (() => void)[] = [];
    const schedule: Schedule = (run) => {
      queue.push(run);
      return () => {
        const at = queue.indexOf(run);
        if (at >= 0) queue.splice(at, 1);
      };
    };
    return {
      schedule,
      pending: () => queue.length,
      next: () => {
        const run = queue.shift();
        run?.();
      },
    };
  }

  function setup() {
    const frame: Call[] = [];
    const canvas = { width: 0, height: 0, getContext: () => recordingContext(frame) };
    const frames = manualSchedule();
    let clock = 0;
    const runner = new SceneRunner(canvas as unknown as HTMLCanvasElement, frames.schedule, () => clock);
    return {
      runner,
      canvas,
      frames,
      frame,
      tick: (ms: number) => {
        clock += ms;
      },
      draws: () => frame.filter((c) => c.name === 'drawImage').length,
    };
  }

  it('draws a still picture when the scene is set, and again on each new size', () => {
    const s = setup();
    s.runner.resize(300, 200);
    s.runner.setScene('night');
    expect(s.draws()).toBe(1);
    s.runner.resize(300.2, 199.8);
    expect(s.draws()).toBe(1);
    s.runner.resize(600, 400);
    expect(s.canvas.width).toBe(600);
    expect(s.canvas.height).toBe(400);
    expect(s.draws()).toBe(2);
    s.runner.setScene('night');
    expect(s.draws()).toBe(2);
    expect(s.frames.pending()).toBe(0);
  });

  it('runs one frame at a time while moving, and stops when motion stops', () => {
    const s = setup();
    s.runner.resize(300, 200);
    s.runner.setScene('rain');
    s.runner.setMoving(true);
    expect(s.frames.pending()).toBe(1);
    s.tick(1000 / SCENE_FPS);
    s.frames.next();
    expect(s.draws()).toBe(2);
    expect(s.frames.pending()).toBe(1);
    s.runner.setMoving(false);
    expect(s.frames.pending()).toBe(0);
    s.runner.setMoving(false);
    expect(s.frames.pending()).toBe(0);
  });

  it('advances scene time only while moving, and counts a long gap as one short step', () => {
    const s = setup();
    const times: number[] = [];
    s.runner.resize(300, 200);
    s.runner.setScene('ocean');
    // Record the scene time of each frame the art draws.
    const art = (s.runner as unknown as { art: { draw: (t: number) => void } }).art;
    const draw = art.draw.bind(art);
    art.draw = (t) => {
      times.push(t);
      draw(t);
    };

    s.runner.setMoving(true);
    s.tick(50);
    s.frames.next();
    s.tick(5000);
    s.frames.next();
    s.runner.setMoving(false);
    s.tick(60_000);
    s.runner.setMoving(true);
    s.tick(20);
    s.frames.next();

    expect(times[0]).toBeCloseTo(STILL_TIME + 0.05, 5);
    expect(times[1]).toBeCloseTo(STILL_TIME + 0.15, 5);
    expect(times[2]).toBeCloseTo(STILL_TIME + 0.17, 5);
  });

  it('draws nothing after stop', () => {
    const s = setup();
    s.runner.resize(300, 200);
    s.runner.setScene('snow');
    s.runner.setMoving(true);
    s.runner.stop();
    expect(s.frames.pending()).toBe(0);
    const before = s.draws();
    s.runner.resize(500, 500);
    expect(s.draws()).toBe(before);
  });
});

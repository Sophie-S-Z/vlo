import { describe, expect, it } from "vitest";
import { createFrameGuard, placeAnchor, progressAt } from "./progress";

const anchors = [
  { top: 0, value: 0 },
  { top: 1000, value: 1 },
  { top: 1500, value: 1 },
  { top: 2500, value: 3 },
];

describe("progressAt", () => {
  it("holds the first and last values outside the anchors", () => {
    expect(progressAt(-50, anchors)).toBe(0);
    expect(progressAt(9000, anchors)).toBe(3);
  });

  it("interpolates between neighbouring anchors", () => {
    expect(progressAt(500, anchors)).toBeCloseTo(0.5);
    expect(progressAt(1200, anchors)).toBe(1);
    expect(progressAt(2000, anchors)).toBeCloseTo(2);
  });

  it("returns 0 with no anchors", () => {
    expect(progressAt(100, [])).toBe(0);
  });
});

describe("placeAnchor", () => {
  const view = { viewport: 800, scrollHeight: 10_000 };

  it("keeps the first anchor at or below the middle of the screen, so the top of the page rests on shape 0", () => {
    const top = placeAnchor({ top: 0, height: 900 }, 0, 8, view);
    expect(top).toBeGreaterThanOrEqual(400);
    expect(
      progressAt(0 + 400, [
        { top, value: 0 },
        { top: 1200, value: 1 },
      ]),
    ).toBe(0);
  });

  it("puts an anchor 30% into its page, capped at one screen", () => {
    expect(placeAnchor({ top: 2000, height: 600 }, 2, 8, view)).toBe(2180);
    expect(placeAnchor({ top: 2000, height: 3000 }, 2, 8, view)).toBe(2240);
  });

  it("keeps the last anchors reachable by the middle of the screen", () => {
    const max = view.scrollHeight - view.viewport / 2;
    expect(placeAnchor({ top: 9900, height: 100 }, 7, 8, view)).toBeLessThan(max);
  });
});

describe("createFrameGuard", () => {
  it("reports a slow device after a full window of slow frames", () => {
    const slow = createFrameGuard({ frames: 4, maxMs: 45 });
    let t = 0;
    const results = [0, 1, 2, 3, 4].map(() => slow((t += 60)));
    expect(results).toEqual([false, false, false, false, true]);
  });

  it("does not report a fast device", () => {
    const slow = createFrameGuard({ frames: 4, maxMs: 45 });
    let t = 0;
    expect(Array.from({ length: 20 }, () => slow((t += 16))).some(Boolean)).toBe(false);
  });

  it("ignores a pause, such as a hidden tab or a shader compile", () => {
    const slow = createFrameGuard({ frames: 4, maxMs: 45 });
    let t = 0;
    const results = [slow((t += 16)), slow((t += 16)), slow((t += 10_000))];
    for (let i = 0; i < 10; i++) results.push(slow((t += 16)));
    expect(results.some(Boolean)).toBe(false);
  });
});

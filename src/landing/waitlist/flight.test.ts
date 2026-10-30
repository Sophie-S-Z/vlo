import { describe, expect, it } from "vitest";
import { FOLD_FRAMES, flightFrames } from "./flight";

const parse = (transform: string) => {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) rotate\((-?[\d.]+)deg\)/.exec(transform);
  if (!match) throw new Error(`bad transform: ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]), angle: Number(match[3]) };
};

describe("flightFrames (spec 18.3 p.10 plane flight)", () => {
  const frames = flightFrames({ width: 1200, height: 800 }, 24);

  it("starts where the plane rests and ends off screen, up and to the right", () => {
    expect(frames).toHaveLength(25);
    const start = parse(String(frames[0]!.transform));
    const end = parse(String(frames.at(-1)!.transform));
    expect(start.x).toBe(0);
    expect(start.y).toBe(0);
    expect(end.x).toBeGreaterThanOrEqual(1200);
    expect(end.y).toBeLessThanOrEqual(-800);
  });

  it("dips first, then climbs, and points the nose along the curve", () => {
    const points = frames.map((frame) => parse(String(frame.transform)));
    expect(Math.max(...points.slice(0, 8).map((p) => p.y))).toBeGreaterThan(0);
    const climb = points[16]!;
    expect(climb.angle).toBeLessThan(0);
    expect(frames.every((frame, i) => frame.offset === i / 24)).toBe(true);
  });
});

describe("FOLD_FRAMES", () => {
  it("keeps the same number of polygon points, so the browser can tween the fold", () => {
    const counts = FOLD_FRAMES.map((frame) => String(frame.clipPath).split(",").length);
    expect(new Set(counts).size).toBe(1);
  });
});

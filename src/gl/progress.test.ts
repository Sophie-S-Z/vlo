import { describe, expect, it } from "vitest";
import { progressAt } from "./progress";

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

import { describe, expect, it } from "vitest";
import { createRandom } from "../random";
import { maskScale, SHAPE_NAMES, sampleShapes, type Mask } from "./index";

/** A fake "Vlo" mask: two filled bars, so tests need no 2D canvas. */
const mask: Mask = (() => {
  const width = 40;
  const height = 10;
  const alpha = new Uint8Array(width * height);
  for (let y = 2; y < 8; y++)
    for (let x = 0; x < width; x++) if (x % 10 < 6) alpha[y * width + x] = 255;
  return { width, height, alpha };
})();

describe("createRandom", () => {
  it("is repeatable for one seed and stays in [0, 1)", () => {
    const a = createRandom(7);
    const b = createRandom(7);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("sampleShapes (spec 18.2)", () => {
  const count = 3000;
  const shapes = sampleShapes({ count, seed: 1, wordmark: mask });

  it("returns the seven shapes in spec order", () => {
    expect(SHAPE_NAMES).toEqual([
      "wordmark",
      "cloud",
      "book",
      "formations",
      "padlock",
      "plane",
      "footer",
    ]);
    expect(shapes).toHaveLength(7);
  });

  it.each(SHAPE_NAMES.map((name, i) => [name, i] as const))(
    "%s has one finite point per particle inside the bounds",
    (_name, i) => {
      const points = shapes[i]!;
      expect(points).toHaveLength(count * 3);
      for (let p = 0; p < count; p++) {
        const [x, y, z] = [points[p * 3]!, points[p * 3 + 1]!, points[p * 3 + 2]!];
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
        expect(Math.abs(x)).toBeLessThanOrEqual(1);
        expect(Math.abs(y)).toBeLessThanOrEqual(1);
        expect(Math.abs(z)).toBeLessThanOrEqual(0.5);
      }
    },
  );

  it("places wordmark points only where the mask is filled", () => {
    const points = shapes[0]!;
    const scale = maskScale(mask);
    for (let p = 0; p < count; p++) {
      const px = Math.floor(points[p * 3]! / scale + mask.width / 2);
      const py = Math.floor(mask.height / 2 - points[p * 3 + 1]! / scale);
      expect(mask.alpha[py * mask.width + px]).toBeGreaterThan(127);
    }
  });

  it("is repeatable for one seed", () => {
    const again = sampleShapes({ count, seed: 1, wordmark: mask });
    expect(Array.from(again[2]!.slice(0, 30))).toEqual(Array.from(shapes[2]!.slice(0, 30)));
  });
});

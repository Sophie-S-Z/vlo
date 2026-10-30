import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAB, labSettings, resetLabForTests, setLab, subscribeLab } from "./settings";

afterEach(() => resetLabForTests());

describe("Ink lab settings (spec 18.1 item 12)", () => {
  it("starts with the defaults", () => {
    expect(labSettings()).toEqual(DEFAULT_LAB);
    expect(DEFAULT_LAB.grain).toBeGreaterThanOrEqual(0.04);
    expect(DEFAULT_LAB.grain).toBeLessThanOrEqual(0.05);
  });

  it("merges changes, tells subscribers, and writes the grain to a CSS variable", () => {
    const listener = vi.fn();
    const stop = subscribeLab(listener);
    setLab({ grain: 0.1, particles: 0.5 });
    expect(labSettings()).toMatchObject({ grain: 0.1, particles: 0.5, bloom: DEFAULT_LAB.bloom });
    expect(listener).toHaveBeenCalledOnce();
    expect(document.documentElement.style.getPropertyValue("--vlo-grain")).toBe("0.1");
    stop();
    setLab({ grain: 0.02 });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("clamps values to safe ranges", () => {
    setLab({ particles: 5, grain: -1, bloom: 99 });
    expect(labSettings()).toMatchObject({ particles: 1, grain: 0, bloom: 3 });
  });
});

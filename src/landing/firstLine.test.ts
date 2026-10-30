import { afterEach, describe, expect, it, vi } from "vitest";
import { FIRST_LINE_MAX, firstLine, setFirstLine, subscribeFirstLine } from "./firstLine";

afterEach(() => setFirstLine(""));

describe("first line store (ADR 0012)", () => {
  it("keeps the line in memory, cut to the maximum, and tells subscribers", () => {
    const listener = vi.fn();
    const stop = subscribeFirstLine(listener);
    setFirstLine("x".repeat(FIRST_LINE_MAX + 10));
    expect(firstLine()).toHaveLength(FIRST_LINE_MAX);
    expect(listener).toHaveBeenCalledOnce();
    setFirstLine("x".repeat(FIRST_LINE_MAX));
    expect(listener).toHaveBeenCalledOnce();
    stop();
  });

  it("never writes to storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setFirstLine("Call me Ishmael.");
    expect(setItem).not.toHaveBeenCalled();
  });
});

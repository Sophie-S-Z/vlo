import { describe, expect, it } from "vitest";
import { isAppEnabled } from "./flags";

describe("isAppEnabled", () => {
  it.each([
    ["true", true],
    [undefined, false],
    ["", false],
    ["1", false],
    ["false", false],
    ["TRUE", false],
    [" true", false],
  ])("%j -> %s", (value, expected) => {
    expect(isAppEnabled(value)).toBe(expected);
  });
});

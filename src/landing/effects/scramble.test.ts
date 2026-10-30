import { describe, expect, it } from "vitest";
import { scrambleText } from "./scramble";

const fixed = () => 0;

describe("scrambleText", () => {
  it("starts at the first text and ends at the second", () => {
    expect(scrambleText("Aunt Rosa", "Aunt Maria", 0, fixed)).toBe("Aunt Rosa");
    expect(scrambleText("Aunt Rosa", "Aunt Maria", 1, fixed)).toBe("Aunt Maria");
  });

  it("reveals the new text from the left and scrambles the rest, keeping spaces", () => {
    const mid = scrambleText("Grandpa Ilya", "Grandpa Ivan", 0.5, fixed);
    expect(mid.slice(0, 6)).toBe("Grandp");
    expect(mid[7]).toBe(" ");
    expect(mid).not.toBe("Grandpa Ilya");
    expect(mid).not.toBe("Grandpa Ivan");
  });

  it("grows or shrinks the length between the two texts", () => {
    expect(scrambleText("ab", "abcdef", 0.5, fixed)).toHaveLength(4);
    expect(scrambleText("abcdef", "ab", 0.5, fixed)).toHaveLength(4);
  });
});

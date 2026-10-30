import { describe, expect, it } from "vitest";
import * as copy from "./copy";

describe("landing copy (spec section 20)", () => {
  it("keeps the exact hero lines", () => {
    expect(copy.HERO.headline).toBe("Write the book only you can write.");
    expect(copy.HERO.note).toBe("No AI unless you ask for it. Your drafts stay on your device.");
    expect(copy.TAGLINE).toBe("Write in flow.");
  });

  it("uses only the twelve public-domain first lines", () => {
    expect(copy.FIRST_LINES).toHaveLength(12);
    expect(copy.FIRST_LINES[0]).toEqual({
      line: "Call me Ishmael.",
      source: "Herman Melville, Moby-Dick (1851)",
    });
    expect(copy.FIRST_LINES.at(-1)?.source).toBe("Robert Frost, The Road Not Taken (1916)");
  });

  it("has the five FAQ entries from the copy deck", () => {
    expect(copy.FAQ.map((f) => f.q)).toEqual([
      "Is Vlo free?",
      "Does Vlo use AI?",
      "Where are my drafts stored?",
      "When does Vlo launch?",
      "Who is Vlo for?",
    ]);
  });

  it("makes no numeric claims other than release years, Ch. labels and syllable counts", () => {
    const text = JSON.stringify({ ...copy, FIRST_LINES: [], DEMO_POEM_SYLLABLES: [] }).replace(
      /Ch\. \d/g,
      "",
    );
    expect(text).not.toMatch(/\d/);
  });

  it("keeps the demo poem's three indent levels exactly", () => {
    const indents = new Set(copy.DEMO_POEM.map((l) => l.match(/^ */)?.[0].length));
    expect([...indents].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 3, 6, 12]);
  });
});

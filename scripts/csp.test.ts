import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";

function directive(csp: string, name: string): string[] {
  const entry = csp.split("; ").find((part) => part.startsWith(`${name} `));
  return entry ? entry.split(" ").slice(1) : [];
}

describe("buildCsp (spec section 15.1)", () => {
  it("allows only self for scripts and network by default", () => {
    const csp = buildCsp();
    expect(directive(csp, "script-src")).toEqual(["'self'"]);
    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
    expect(directive(csp, "font-src")).toEqual(["'self'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-eval/);
  });

  it("adds extra connect-src hosts", () => {
    const csp = buildCsp({ connectSrc: ["https://example.supabase.co"] });
    expect(directive(csp, "connect-src")).toEqual(["'self'", "https://example.supabase.co"]);
  });
});

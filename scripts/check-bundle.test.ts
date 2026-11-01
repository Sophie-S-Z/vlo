import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBundle, FORBIDDEN_IN_INITIAL, HIDDEN_APP_MODULES } from "./check-bundle.mjs";

type Chunk = { isEntry: boolean; imports: string[]; dynamicImports: string[]; modules: string[] };

function fixture(chunks: Record<string, Chunk & { bytes?: string }>) {
  const root = mkdtempSync(join(tmpdir(), "vlo-bundle-"));
  mkdirSync(join(root, "dist/assets"), { recursive: true });
  const map: Record<string, Chunk> = {};
  for (const [file, { bytes = "x", ...info }] of Object.entries(chunks)) {
    writeFileSync(join(root, "dist", file), bytes);
    map[file] = info;
  }
  writeFileSync(join(root, "modules.json"), JSON.stringify(map));
  return { dist: join(root, "dist"), moduleMap: join(root, "modules.json") };
}

const chunk = (modules: string[], extra: Partial<Chunk> = {}): Chunk => ({
  isEntry: false,
  imports: [],
  dynamicImports: [],
  modules,
  ...extra,
});

describe("checkBundle (spec section 21, guardrail 5)", () => {
  it("passes when heavy modules sit only in lazy chunks", () => {
    const paths = fixture({
      "assets/index.js": chunk(["/src/main.tsx"], {
        isEntry: true,
        imports: ["assets/vendor.js"],
        dynamicImports: ["assets/gl.js"],
      }),
      "assets/vendor.js": chunk(["/node_modules/react/index.js"]),
      "assets/gl.js": chunk(["/node_modules/three/build/three.module.js"]),
    });
    const result = checkBundle({ ...paths, maxGzipKb: 250 });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.initialFiles).toEqual(["assets/index.js", "assets/vendor.js"]);
  });

  it.each([
    "/node_modules/three/build/three.module.js",
    "/node_modules/matter-js/build/matter.js",
    "/node_modules/tweakpane/dist/tweakpane.js",
    "/node_modules/@mlc-ai/web-llm/lib/index.js",
    "/home/u/vlo/src/ai/engine.ts",
  ])("fails when %s is in a statically imported chunk", (moduleId) => {
    const paths = fixture({
      "assets/index.js": chunk(["/src/main.tsx"], { isEntry: true, imports: ["assets/shared.js"] }),
      "assets/shared.js": chunk([moduleId]),
    });
    const result = checkBundle({ ...paths, maxGzipKb: 250 });
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toContain(moduleId);
  });

  it("fails when the initial JavaScript is over the gzip budget", () => {
    const random = Array.from({ length: 40_000 }, () => Math.random().toString(36)).join("");
    const paths = fixture({
      "assets/index.js": { ...chunk(["/src/main.tsx"], { isEntry: true }), bytes: random },
    });
    const result = checkBundle({ ...paths, maxGzipKb: 10 });
    expect(result.ok).toBe(false);
    expect(result.violations.join()).toMatch(/budget/);
  });

  it("fails when the module map has no entry chunk", () => {
    const paths = fixture({ "assets/a.js": chunk(["/src/main.tsx"]) });
    const result = checkBundle({ ...paths, maxGzipKb: 250 });
    expect(result.ok).toBe(false);
    expect(result.violations.join()).toMatch(/no entry chunk/);
  });

  it("fails when hidden app code is built at all, even in a lazy chunk", () => {
    const paths = fixture({
      "assets/index.js": chunk(["/src/main.tsx", "/home/u/vlo/src/appLoader.ts"], {
        isEntry: true,
      }),
      "assets/AppShell.js": chunk(["/home/u/vlo/src/app/AppShell.tsx"]),
    });
    const result = checkBundle({ ...paths, maxGzipKb: 250, forbiddenAnywhere: HIDDEN_APP_MODULES });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      "/home/u/vlo/src/app/AppShell.tsx ships in assets/AppShell.js but must not be built",
    ]);
  });

  it.each([
    ["/node_modules/three/src/Three.js", true],
    ["/node_modules/react/index.js", false],
    ["/home/u/vlo/src/ai-helpers/x.ts", false],
    ["/node_modules/gsap/ScrollTrigger.js", true],
    ["/node_modules/lenis/dist/lenis.mjs", true],
    ["/node_modules/motion/dist/es/index.mjs", true],
    ["/home/u/vlo/src/landing/effects/index.ts", true],
    ["/home/u/vlo/src/landing/useLandingEffects.ts", false],
  ])("FORBIDDEN_IN_INITIAL matches %s: %s", (moduleId, expected) => {
    expect(FORBIDDEN_IN_INITIAL.some((pattern) => pattern.test(moduleId))).toBe(expected);
  });
});

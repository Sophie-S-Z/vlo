import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_SWATCHES, THEMES } from "./theme/ThemeProvider";

const css = readFileSync(resolve(process.cwd(), "src/ui/tokens.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing block ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

function value(selector: string, name: string): string | undefined {
  const match = block(selector).match(new RegExp(`${name}:\\s*([^;]+);`));
  return match?.[1]?.trim().toUpperCase();
}

describe("design tokens (spec section 16)", () => {
  it.each([
    ['[data-theme="ink"]', { bg: "#0E0D0C", text: "#EFE8DC", muted: "#8C857A", accent: "#E0664B" }],
    ['[data-theme="paper"]', { bg: "#F5F1E8", text: "#1C1A17", accent: "#C8452D" }],
    ['[data-theme="night"]', { bg: "#121110", text: "#E8E2D6", accent: "#E0664B" }],
    ['[data-theme="sepia"]', { bg: "#EFE3CC", text: "#3A2E22", accent: "#A8432A" }],
  ])("%s has the exact palette", (selector, palette) => {
    for (const [key, hex] of Object.entries(palette)) {
      expect(value(selector, `--vlo-${key}`)).toBe(hex);
    }
  });

  it("matches each theme swatch to that theme's background", () => {
    for (const theme of THEMES) {
      expect(THEME_SWATCHES[theme]).toBe(value(`[data-theme="${theme}"]`, "--vlo-bg"));
    }
  });

  it("keeps accent text at WCAG AA contrast on Paper", () => {
    expect(value('[data-theme="paper"]', "--vlo-accent-text")).toBe("#B03A24");
  });

  it("defines the ink-effect accent and the vlo ease on :root", () => {
    expect(value(":root", "--vlo-ink")).toBe("#5B6CFF");
    expect(value(":root", "--vlo-ease")).toBe("CUBIC-BEZIER(0.65, 0, 0.35, 1)");
    expect(value(":root", "--vlo-radius-card")).toBe("10PX");
  });
});

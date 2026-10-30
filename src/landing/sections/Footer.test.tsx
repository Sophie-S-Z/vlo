import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { ThemeProvider } from "@/ui/theme/ThemeProvider";
import { Footer } from "./Footer";

describe("Footer wordmark wave (spec 18.3)", () => {
  it("cuts the ASCII wordmark into three letter blocks that rebuild every line", () => {
    render(
      <MotionPreferencesProvider>
        <ThemeProvider scope="landing">
          <MemoryRouter>
            <Footer />
          </MemoryRouter>
        </ThemeProvider>
      </MotionPreferencesProvider>,
    );
    const letters = Array.from(document.querySelectorAll("[data-wave-letter]"));
    expect(letters).toHaveLength(3);
    const columns = letters.map((letter) => letter.textContent!.split("\n"));
    const rows = columns[0]!.map((_, row) => columns.map((c) => c[row]).join("").trimEnd());
    expect(rows[1]).toBe(" \\ \\    / / | |   ___");
    expect(rows.at(-1)).toBe("    \\__/    |_|  \\___/");
  });
});

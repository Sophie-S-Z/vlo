import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { mockMatchMedia } from "@/test/matchMedia";
import { ThemeProvider } from "@/ui/theme/ThemeProvider";
import { WaitlistSection } from "./sections/WaitlistSection";
import { LandingPage } from "./LandingPage";

function renderLanding() {
  const router = createMemoryRouter([{ path: "/", element: <LandingPage appEnabled={false} /> }]);
  render(
    <MotionPreferencesProvider>
      <ThemeProvider scope="landing">
        <RouterProvider router={router} />
      </ThemeProvider>
    </MotionPreferencesProvider>,
  );
}

describe("LandingPage (spec 18.3)", () => {
  beforeEach(() => {
    mockMatchMedia();
  });

  it("has one h1 and a labelled region for each page", () => {
    renderLanding();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const name of [
      "Built for stories, memories and poems",
      "The book opens",
      "Three forms, three workspaces",
      "Pen mode is the default. It sends nothing.",
      "AI on your terms",
      "Built for the whole draft",
      "First lines",
      "Questions",
      "Save your page.",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("keeps the poem's leading spaces in the DOM", () => {
    renderLanding();
    const poem = screen.getByTestId("poem-text");
    expect(poem.textContent).toContain("\n            I set the cup down");
  });

  it("answers the FAQ with native disclosure widgets", () => {
    renderLanding();
    const faq = screen.getByRole("region", { name: "Questions" });
    expect(within(faq).getAllByRole("group")).toHaveLength(5);
  });

  it("has a target for every cursor label (spec 18.1 item 5)", async () => {
    // gsap reads matchMedia on import, so the module loads after the mock.
    const { CURSOR_LABELS } = await import("./effects/pointer");
    renderLanding();
    for (const [selector] of CURSOR_LABELS) {
      expect(document.querySelector(selector), selector).not.toBeNull();
    }
  });
});

describe("WaitlistSection count (spec 18.4)", () => {
  it.each([
    [null, false],
    [99, false],
    [100, true],
  ])("count %s shows the line: %s", (count, shown) => {
    render(
      <MotionPreferencesProvider>
        <WaitlistSection count={count} />
      </MotionPreferencesProvider>,
    );
    expect(screen.queryByText(/writers are waiting/) !== null).toBe(shown);
  });
});

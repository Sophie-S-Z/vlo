import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { mockMatchMedia } from "@/test/matchMedia";
import NotFoundPage from "./NotFoundPage";

describe("NotFoundPage (spec 18.3 404 physics)", () => {
  beforeEach(() => mockMatchMedia());

  it("keeps the heading as real text and gives each visible letter its own tile", () => {
    render(
      <MotionPreferencesProvider>
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>
      </MotionPreferencesProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "This page isn't written yet" }),
    ).toBeInTheDocument();
    const letters = document.querySelectorAll("[data-letter]");
    expect(letters).toHaveLength("Thispageisn'twrittenyet".length);
    expect(letters[0]!.closest("[aria-hidden=true]")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Go to the first page" })).toHaveAttribute("href", "/");
  });
});

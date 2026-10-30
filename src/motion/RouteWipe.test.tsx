import { act, render } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { mockMatchMedia, REDUCED_MOTION_QUERY } from "@/test/matchMedia";
import { RouteWipe } from "./RouteWipe";

function setup() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <RouteWipe />
            <Outlet />
          </>
        ),
        children: [
          { index: true, element: <p>Home</p> },
          { path: "privacy", element: <p>Privacy</p> },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  render(
    <MotionPreferencesProvider>
      <RouterProvider router={router} />
    </MotionPreferencesProvider>,
  );
  return router;
}

const bars = () => document.querySelectorAll("[data-wipe-bar]");

describe("RouteWipe (spec 18.3 route wipes)", () => {
  beforeEach(() => mockMatchMedia());

  it("shows nothing on the first page load", () => {
    setup();
    expect(bars()).toHaveLength(0);
  });

  it("sweeps five bars across on a route change, and again on the next one", async () => {
    const router = setup();
    await act(() => router.navigate("/privacy"));
    expect(bars()).toHaveLength(5);
    const first = bars()[0];
    await act(() => router.navigate("/"));
    expect(bars()).toHaveLength(5);
    expect(bars()[0]).not.toBe(first); // new nodes restart the CSS animation
    expect(document.querySelector("[data-route-wipe]")).toHaveAttribute("aria-hidden", "true");
  });

  it("does not wipe for a hash change on the same page", async () => {
    const router = setup();
    await act(() => router.navigate("/#waitlist"));
    expect(bars()).toHaveLength(0);
  });

  it("does not wipe with reduced motion", async () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    const router = setup();
    await act(() => router.navigate("/privacy"));
    expect(bars()).toHaveLength(0);
  });
});

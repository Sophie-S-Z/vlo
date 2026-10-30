import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { mockMatchMedia } from "@/test/matchMedia";
import { createRoutes } from "./router";

function renderAt(path: string, appEnabled = false) {
  const loadApp = appEnabled ? () => import("@/app/AppShell") : null;
  const router = createMemoryRouter(createRoutes({ loadApp }), { initialEntries: [path] });
  render(
    <MotionPreferencesProvider>
      <RouterProvider router={router} />
    </MotionPreferencesProvider>,
  );
}

describe("routes (spec section 7)", () => {
  beforeEach(() => {
    mockMatchMedia();
  });

  it.each([
    ["/", "Write the book only you can write."],
    ["/privacy", "Privacy"],
    ["/ai-policy", "AI policy"],
    ["/share/abc123", "Shared draft"],
    ["/no-such-page", "This page isn't written yet"],
  ])("%s shows its heading", async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it("hides /app and the landing link when the flag is off", async () => {
    renderAt("/app");
    expect(
      await screen.findByRole("heading", { level: 1, name: "This page isn't written yet" }),
    ).toBeInTheDocument();
    renderAt("/");
    await screen.findAllByRole("heading", { level: 1 });
    expect(document.querySelector('a[href^="/app"]')).toBeNull();
  });

  it("serves /app/* and links to it from the landing page when the flag is on", async () => {
    renderAt("/app/projects/1", true);
    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
  });

  it("links to /app from the landing page when the flag is on", async () => {
    renderAt("/", true);
    expect(await screen.findByRole("link", { name: "Open the app" })).toHaveAttribute(
      "href",
      "/app",
    );
  });

  it("uses Ink on landing routes", async () => {
    renderAt("/");
    await screen.findAllByRole("heading", { level: 1 });
    expect(document.documentElement.dataset.theme).toBe("ink");
  });

  it("uses Paper in the app", async () => {
    renderAt("/app", true);
    await screen.findByRole("heading", { level: 1, name: "Library" });
    expect(document.documentElement.dataset.theme).toBe("paper");
  });

  it.each([
    ["/", "Vlo · Write in flow"],
    ["/privacy", "Privacy · Vlo"],
    ["/no-such-page", "Page not found · Vlo"],
  ])("%s sets the document title", async (path, title) => {
    renderAt(path);
    await screen.findAllByRole("heading", { level: 1 });
    await vi.waitFor(() => expect(document.title).toBe(title));
  });
});

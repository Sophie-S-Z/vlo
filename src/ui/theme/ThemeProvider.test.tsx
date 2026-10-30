import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { mockMatchMedia, REDUCED_MOTION_QUERY } from "@/test/matchMedia";
import { THEMES, ThemeProvider, themeStorageKey, useTheme, type ThemeScope } from "./ThemeProvider";
import { ThemeSwitch } from "./ThemeSwitch";

const html = document.documentElement;
type StartViewTransition = (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
const doc = document as unknown as { startViewTransition?: StartViewTransition };

function wrapperFor(scope: ThemeScope) {
  return ({ children }: { children: ReactNode }) => (
    <MotionPreferencesProvider>
      <ThemeProvider scope={scope}>{children}</ThemeProvider>
    </MotionPreferencesProvider>
  );
}

describe("ThemeProvider", () => {
  let media: ReturnType<typeof mockMatchMedia>;
  beforeEach(() => {
    media = mockMatchMedia();
  });
  afterEach(() => {
    delete doc.startViewTransition;
    vi.restoreAllMocks();
  });

  it("lists the four themes from the spec", () => {
    expect(THEMES).toEqual(["ink", "paper", "night", "sepia"]);
  });

  it("defaults to Ink on the landing page and Paper in the app", () => {
    renderHook(() => useTheme(), { wrapper: wrapperFor("landing") });
    expect(html.dataset.theme).toBe("ink");
    renderHook(() => useTheme(), { wrapper: wrapperFor("app") });
    expect(html.dataset.theme).toBe("paper");
  });

  it("changes the theme at once and stores it per scope when View Transitions are missing", () => {
    const { result } = renderHook(() => useTheme(), { wrapper: wrapperFor("app") });
    act(() => result.current.setTheme("sepia"));
    expect(result.current.theme).toBe("sepia");
    expect(html.dataset.theme).toBe("sepia");
    expect(localStorage.getItem(themeStorageKey("app"))).toBe("sepia");
    expect(localStorage.getItem(themeStorageKey("landing"))).toBeNull();
  });

  it("ignores an unknown stored theme", () => {
    localStorage.setItem(themeStorageKey("app"), "neon");
    const { result } = renderHook(() => useTheme(), { wrapper: wrapperFor("app") });
    expect(result.current.theme).toBe("paper");
  });

  it("uses a View Transition when supported and motion is allowed", () => {
    const start = vi.fn<StartViewTransition>((cb) => {
      cb();
      return { ready: new Promise(() => {}), finished: Promise.resolve() };
    });
    doc.startViewTransition = start;
    const { result } = renderHook(() => useTheme(), { wrapper: wrapperFor("app") });
    act(() => result.current.setTheme("night", { x: 10, y: 20 }));
    expect(start).toHaveBeenCalledOnce();
    expect(html.dataset.theme).toBe("night");
  });

  it("skips the View Transition under reduced motion", () => {
    media.set(REDUCED_MOTION_QUERY, true);
    const start = vi.fn<StartViewTransition>();
    doc.startViewTransition = start;
    const { result } = renderHook(() => useTheme(), { wrapper: wrapperFor("app") });
    act(() => result.current.setTheme("night"));
    expect(start).not.toHaveBeenCalled();
    expect(html.dataset.theme).toBe("night");
  });
});

describe("ThemeSwitch", () => {
  beforeEach(() => {
    mockMatchMedia();
  });

  it("offers every theme as a labelled radio and switches on click", async () => {
    render(<ThemeSwitch />, { wrapper: wrapperFor("app") });
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Paper" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Ink" }));
    expect(html.dataset.theme).toBe("ink");
    expect(screen.getByRole("radio", { name: "Ink" })).toHaveAttribute("aria-checked", "true");
  });
});

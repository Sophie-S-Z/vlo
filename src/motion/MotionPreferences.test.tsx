import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia, REDUCED_MOTION_QUERY } from "@/test/matchMedia";
import {
  CALM_STORAGE_KEY,
  MotionPreferencesProvider,
  useMotionPreferences,
} from "./MotionPreferences";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MotionPreferencesProvider>{children}</MotionPreferencesProvider>
);
const html = document.documentElement;

describe("MotionPreferencesProvider", () => {
  let media: ReturnType<typeof mockMatchMedia>;
  beforeEach(() => {
    media = mockMatchMedia();
  });
  afterEach(() => vi.restoreAllMocks());

  it("starts with full motion when Calm is off and the system allows motion", () => {
    const { result } = renderHook(() => useMotionPreferences(), { wrapper });
    expect(result.current).toMatchObject({ calm: false, systemReduced: false, reduced: false });
    expect(html.dataset.motion).toBe("full");
    expect(html.dataset.calm).toBe("off");
  });

  it("Calm mode reduces motion and persists across remounts", () => {
    const first = renderHook(() => useMotionPreferences(), { wrapper });
    act(() => first.result.current.setCalm(true));
    expect(first.result.current.reduced).toBe(true);
    expect(html.dataset.motion).toBe("reduced");
    expect(localStorage.getItem(CALM_STORAGE_KEY)).toBe("on");
    first.unmount();

    const second = renderHook(() => useMotionPreferences(), { wrapper });
    expect(second.result.current.calm).toBe(true);
  });

  it("follows the system reduced-motion setting, including live changes", () => {
    media.set(REDUCED_MOTION_QUERY, true);
    const { result } = renderHook(() => useMotionPreferences(), { wrapper });
    expect(result.current).toMatchObject({ systemReduced: true, reduced: true, calm: false });

    act(() => media.set(REDUCED_MOTION_QUERY, false));
    expect(result.current.reduced).toBe(false);
    expect(html.dataset.motion).toBe("full");
  });

  it("falls back to defaults when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useMotionPreferences(), { wrapper });
    expect(result.current.calm).toBe(false);
    act(() => result.current.setCalm(true));
    expect(result.current.reduced).toBe(true);
  });

  it("throws a clear error outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useMotionPreferences())).toThrow(/MotionPreferencesProvider/);
  });
});

describe("CalmSwitch", () => {
  beforeEach(() => {
    mockMatchMedia();
  });

  it("is a labelled switch that toggles Calm mode", async () => {
    const { CalmSwitch } = await import("./CalmSwitch");
    render(<CalmSwitch />, { wrapper });
    const toggle = screen.getByRole("switch", { name: "Calm" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(html.dataset.motion).toBe("reduced");
  });
});

describe("CalmSwitch hint", () => {
  it("describes the system setting to assistive technology", async () => {
    const media = mockMatchMedia();
    media.set(REDUCED_MOTION_QUERY, true);
    const { CalmSwitch } = await import("./CalmSwitch");
    render(<CalmSwitch />, { wrapper });
    expect(screen.getByRole("switch", { name: "Calm" })).toHaveAccessibleDescription(
      "Your system already asks for reduced motion.",
    );
  });
});

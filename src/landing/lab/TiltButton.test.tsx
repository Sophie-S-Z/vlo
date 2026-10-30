import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { mockMatchMedia, REDUCED_MOTION_QUERY } from "@/test/matchMedia";
import { disableTilt, tiltOn } from "./tilt";
import { TiltButton } from "./TiltButton";

const renderButton = () =>
  render(
    <MotionPreferencesProvider>
      <TiltButton />
    </MotionPreferencesProvider>,
  );

describe("TiltButton (spec 18.1 item 11)", () => {
  beforeEach(() => {
    mockMatchMedia();
    vi.stubGlobal("DeviceOrientationEvent", class extends Event {});
  });
  afterEach(() => {
    disableTilt();
    vi.unstubAllGlobals();
  });

  it("turns the gyroscope on and off with a tap", async () => {
    renderButton();
    const button = screen.getByRole("button", { name: "Enable motion" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(tiltOn()).toBe(true);
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(tiltOn()).toBe(false);
  });

  it("is absent with reduced motion, and Calm turns the tilt off", async () => {
    const media = mockMatchMedia();
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Enable motion" }));
    act(() => media.set(REDUCED_MOTION_QUERY, true));
    expect(tiltOn()).toBe(false);
    expect(screen.queryByRole("button", { name: "Enable motion" })).not.toBeInTheDocument();
  });

  it("is absent where the device has no orientation sensor", () => {
    vi.unstubAllGlobals();
    const saved = window.DeviceOrientationEvent;
    // @ts-expect-error jsdom may define it; remove it for this test.
    delete window.DeviceOrientationEvent;
    renderButton();
    expect(screen.queryByRole("button", { name: "Enable motion" })).not.toBeInTheDocument();
    if (saved) window.DeviceOrientationEvent = saved;
  });

  it("stops the tilt when the landing page unmounts", async () => {
    const { unmount } = renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Enable motion" }));
    unmount();
    expect(tiltOn()).toBe(false);
  });
});

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { CALM_STORAGE_KEY } from "@/motion/MotionPreferences";
import { setStoredValue } from "@/ui/lib/storedValue";

const engine = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  tick: vi.fn(),
  paper: vi.fn(),
  level: vi.fn(() => 0),
}));
vi.mock("./engine", () => ({ createEngine: () => engine }));

const { SoundSwitch } = await import("./SoundSwitch");
const { playPaper, setSound, SOUND_KEY } = await import("./sound");

afterEach(() => {
  act(() => setSound(false));
  localStorage.removeItem(SOUND_KEY);
  setStoredValue(CALM_STORAGE_KEY, "off");
  vi.clearAllMocks();
});

const renderSwitch = () =>
  render(
    <MotionPreferencesProvider>
      <SoundSwitch />
    </MotionPreferencesProvider>,
  );

describe("SoundSwitch (spec 18.1 item 10)", () => {
  it("starts sound on the first click on the page, by default (ADR 0012)", async () => {
    const user = userEvent.setup();
    renderSwitch();
    const sound = screen.getByRole("switch", { name: "Sound" });
    expect(engine.start).not.toHaveBeenCalled();
    await user.click(document.body);
    expect(sound).toHaveAttribute("aria-checked", "true");
    await vi.waitFor(() => expect(engine.start).toHaveBeenCalledOnce());
  });

  it("starts sound on the first key press too", async () => {
    const user = userEvent.setup();
    renderSwitch();
    await user.keyboard("a");
    expect(screen.getByRole("switch", { name: "Sound" })).toHaveAttribute("aria-checked", "true");
  });

  it("remembers a visitor who turned sound off", async () => {
    const user = userEvent.setup();
    const first = renderSwitch();
    await user.click(document.body);
    await user.click(screen.getByRole("switch", { name: "Sound" }));
    expect(localStorage.getItem(SOUND_KEY)).toBe("off");
    first.unmount();
    act(() => setSound(false));
    renderSwitch();
    await user.click(document.body);
    expect(screen.getByRole("switch", { name: "Sound" })).toHaveAttribute("aria-checked", "false");
  });

  it("does not start sound by default with Calm on", async () => {
    const user = userEvent.setup();
    setStoredValue(CALM_STORAGE_KEY, "on");
    renderSwitch();
    await user.click(document.body);
    expect(engine.start).not.toHaveBeenCalled();
  });

  it("is off before any interaction, and its own click starts the engine", async () => {
    const user = userEvent.setup();
    renderSwitch();
    const sound = screen.getByRole("switch", { name: "Sound" });
    expect(sound).toHaveAttribute("aria-checked", "false");
    expect(engine.start).not.toHaveBeenCalled();
    playPaper();
    expect(engine.paper).not.toHaveBeenCalled();

    await user.click(sound);
    expect(sound).toHaveAttribute("aria-checked", "true");
    await vi.waitFor(() => expect(engine.start).toHaveBeenCalledOnce());
    playPaper();
    expect(engine.paper).toHaveBeenCalledOnce();

    await user.click(sound);
    expect(sound).toHaveAttribute("aria-checked", "false");
    expect(engine.stop).toHaveBeenCalled();
  });

  it("Calm turns sound off and keeps the switch off", async () => {
    const user = userEvent.setup();
    renderSwitch();
    const sound = screen.getByRole("switch", { name: "Sound" });
    await user.click(sound);
    act(() => setStoredValue(CALM_STORAGE_KEY, "on"));
    expect(sound).toHaveAttribute("aria-checked", "false");
    expect(sound).toBeDisabled();
    expect(sound).toHaveAccessibleDescription("Calm keeps sound off.");
  });
});

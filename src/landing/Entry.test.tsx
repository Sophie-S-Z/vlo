import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENTRY } from "./copy";

vi.mock("./effects", () => ({}));
const chooseSound = vi.hoisted(() => vi.fn());
vi.mock("@/audio/sound", () => ({ chooseSound }));
const { Entry, ENTERED_KEY, AUTO_OPEN_MS } = await import("./Entry");

function page() {
  return render(
    <div>
      <Entry />
      <main id="main" tabIndex={-1}>
        Page
      </main>
    </div>,
  );
}

afterEach(() => {
  chooseSound.mockClear();
  delete document.documentElement.dataset.entry;
  localStorage.clear();
  vi.useRealTimers();
});

describe("Entry curtain (spec 18.3 p.00)", () => {
  it("stays closed without the first-visit flag", () => {
    page();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("on a first visit shows the lines, keeps the page inert, and enters in silence", async () => {
    document.documentElement.dataset.entry = "first";
    const user = userEvent.setup();
    page();
    const dialog = await screen.findByRole("dialog", { name: ENTRY.label });
    for (const line of ENTRY.lines) expect(dialog).toHaveTextContent(line);
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert");

    await user.click(await screen.findByRole("button", { name: ENTRY.silence }));
    expect(localStorage.getItem(ENTERED_KEY)).toBe("1");
    expect(chooseSound).toHaveBeenCalledWith(false);
    await vi.waitFor(() => expect(document.documentElement.dataset.entry).toBeUndefined());
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("Enter with sound turns sound on", async () => {
    document.documentElement.dataset.entry = "first";
    const user = userEvent.setup();
    page();
    await user.click(await screen.findByRole("button", { name: ENTRY.withSound }));
    expect(chooseSound).toHaveBeenCalledWith(true);
  });

  it("opens by itself about 1.5 s after loading ends, with no sound choice (5A)", async () => {
    expect(AUTO_OPEN_MS).toBeLessThanOrEqual(1500);
    document.documentElement.dataset.entry = "first";
    page();
    await screen.findByRole("dialog");
    await vi.waitFor(() => expect(localStorage.getItem(ENTERED_KEY)).toBe("1"), {
      timeout: AUTO_OPEN_MS + 1500,
    });
    await vi.waitFor(() => expect(document.documentElement.dataset.entry).toBeUndefined());
    expect(chooseSound).not.toHaveBeenCalled();
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
  });

  it("waits while the visitor points at the intro", async () => {
    document.documentElement.dataset.entry = "first";
    const user = userEvent.setup();
    page();
    await user.hover(await screen.findByRole("button", { name: ENTRY.withSound }));
    await new Promise((resolve) => setTimeout(resolve, AUTO_OPEN_MS + 300));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Escape skips the intro", async () => {
    document.documentElement.dataset.entry = "first";
    const user = userEvent.setup();
    page();
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(localStorage.getItem(ENTERED_KEY)).toBe("1");
    expect(chooseSound).not.toHaveBeenCalled();
  });
});

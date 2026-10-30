import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENTRY } from "./copy";

vi.mock("./effects", () => ({}));
const setSound = vi.hoisted(() => vi.fn());
vi.mock("@/audio/sound", () => ({ setSound }));
const { Entry, ENTERED_KEY } = await import("./Entry");

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
    expect(setSound).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.documentElement.dataset.entry).toBeUndefined());
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("Enter with sound turns sound on", async () => {
    document.documentElement.dataset.entry = "first";
    const user = userEvent.setup();
    page();
    await user.click(await screen.findByRole("button", { name: ENTRY.withSound }));
    expect(setSound).toHaveBeenCalledWith(true);
  });

  it("Escape skips the intro", async () => {
    document.documentElement.dataset.entry = "first";
    const user = userEvent.setup();
    page();
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(localStorage.getItem(ENTERED_KEY)).toBe("1");
  });
});

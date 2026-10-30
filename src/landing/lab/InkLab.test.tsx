import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InkLab } from "./InkLab";
import { resetLabForTests, setInkLabOpen } from "./settings";

vi.mock("./panel", () => ({ createPanel: vi.fn(() => () => {}) }));

afterEach(() => resetLabForTests());

describe("InkLab (spec 18.1 item 12)", () => {
  it("opens with ~ and closes with Escape", async () => {
    render(<InkLab />);
    expect(screen.queryByRole("region", { name: "Ink lab" })).not.toBeInTheDocument();
    await userEvent.keyboard("~");
    const region = await screen.findByRole("region", { name: "Ink lab" });
    expect(region).toHaveFocus();
    const { createPanel } = await import("./panel");
    await waitFor(() => expect(createPanel).toHaveBeenCalled());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Ink lab" })).not.toBeInTheDocument();
  });

  it("ignores ~ typed in a field", async () => {
    render(
      <>
        <input aria-label="Email" />
        <InkLab />
      </>,
    );
    await userEvent.type(screen.getByLabelText("Email"), "~");
    expect(screen.queryByRole("region", { name: "Ink lab" })).not.toBeInTheDocument();
  });

  it("opens from a button and returns focus to it on close", async () => {
    render(
      <>
        <button type="button" onClick={() => setInkLabOpen(true)}>
          Ink lab
        </button>
        <InkLab />
      </>,
    );
    const opener = screen.getByRole("button", { name: "Ink lab" });
    await userEvent.click(opener);
    await userEvent.click(await screen.findByRole("button", { name: "Close Ink lab" }));
    expect(opener).toHaveFocus();
  });

  it("closes when the landing page unmounts", () => {
    const { unmount } = render(<InkLab />);
    act(() => setInkLabOpen(true));
    unmount();
    render(<InkLab />);
    expect(screen.queryByRole("region", { name: "Ink lab" })).not.toBeInTheDocument();
  });
});

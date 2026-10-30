import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { firstLine, setFirstLine } from "../firstLine";
import { FirstLineField } from "./FirstLineField";

afterEach(() => setFirstLine(""));

describe("FirstLineField (ADR 0012)", () => {
  it("passes the typed line to the store and keeps it out of storage and spell-check", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<FirstLineField />);
    const input = screen.getByRole("textbox", { name: "Your first line" });
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAccessibleDescription("It stays in this tab. Nothing is saved or sent.");
    expect(input.closest("form")).toBeNull();
    await userEvent.type(input, "Call me Ishmael.");
    expect(firstLine()).toBe("Call me Ishmael.");
    expect(setItem).not.toHaveBeenCalled();
  });
});

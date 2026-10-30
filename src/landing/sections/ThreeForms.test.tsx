import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEMO_SCENES } from "../copy";
import { ThreeForms } from "./ThreeForms";

describe("Novel panel (spec 18.3 p.04)", () => {
  it("starts in Board with threads in story order and switches to Grid without effects", async () => {
    const user = userEvent.setup();
    render(<ThreeForms />);
    const cards = screen.getByRole("list", { name: "Scene cards" });
    const grid = screen.getByRole("button", { name: "Grid" });
    const board = screen.getByRole("button", { name: "Board" });
    const threads = () => cards.parentElement!.querySelectorAll("[data-thread]");
    expect(board).toHaveAttribute("aria-pressed", "true");
    expect(cards).toHaveAttribute("data-layout", "board");
    expect(threads()).toHaveLength(DEMO_SCENES.length - 1);
    expect(within(cards).getAllByRole("listitem")).toHaveLength(DEMO_SCENES.length);

    await user.click(grid);
    expect(grid).toHaveAttribute("aria-pressed", "true");
    expect(board).toHaveAttribute("aria-pressed", "false");
    expect(cards).toHaveAttribute("data-layout", "grid");
    expect(threads()).toHaveLength(0);
  });
});

describe("Memoir panel (spec 18.3 p.04)", () => {
  it("a marked name switches to its alias on click and back again", async () => {
    const user = userEvent.setup();
    render(<ThreeForms />);
    const name = screen.getByRole("button", { name: "Aunt Rosa" });
    expect(name).toHaveAttribute("aria-pressed", "false");
    expect(name).toHaveAccessibleDescription(/aliases/);
    await user.click(name);
    expect(name).toHaveAccessibleName("Aunt Maria");
    expect(name).toHaveAttribute("aria-pressed", "true");
    expect(name).toHaveAttribute("data-text", "Aunt Maria");
    await user.click(name);
    expect(name).toHaveAccessibleName("Aunt Rosa");
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIRST_LINES, FIRST_LINES_SECTION } from "../copy";
import { FirstLines } from "./FirstLines";

describe("First lines (spec 18.3 p.08)", () => {
  it("shows every first line with its source and three blank cards that lead to the waitlist", () => {
    render(<FirstLines />);
    const list = screen.getByRole("list", { name: "First lines" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(FIRST_LINES.length + 3);
    for (const { source } of FIRST_LINES)
      expect(within(list).getByText(source)).toBeInTheDocument();
    const blanks = within(list).getAllByRole("link", { name: FIRST_LINES_SECTION.blank });
    expect(blanks).toHaveLength(3);
    for (const blank of blanks) expect(blank).toHaveAttribute("href", "#waitlist");
  });
});

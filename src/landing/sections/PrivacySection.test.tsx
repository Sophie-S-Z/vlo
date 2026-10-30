import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AI_MODES, PRIVACY } from "../copy";
import { PrivacySection } from "./PrivacySection";

describe("Privacy section (spec 18.3 p.05)", () => {
  it("starts in Pen and shows each mode's summary; requests to Vlo stay at 0", async () => {
    const user = userEvent.setup();
    render(<PrivacySection />);
    const group = screen.getByRole("radiogroup", { name: "Writing mode" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Pen" })).toBeChecked();
    const badge = screen.getByTestId("mode-badge");
    expect(badge).toHaveTextContent(AI_MODES[0].summary);
    expect(screen.getByTestId("vlo-requests")).toHaveTextContent("0");

    await user.click(screen.getByRole("radio", { name: "Reader" }));
    expect(badge).toHaveTextContent(AI_MODES[1].summary);
    await user.click(screen.getByRole("radio", { name: "Co-writer" }));
    expect(badge).toHaveTextContent(AI_MODES[2].summary);
    expect(screen.getByTestId("vlo-requests")).toHaveTextContent("0");
  });

  it("keeps the hidden line as real, readable text", () => {
    render(<PrivacySection />);
    expect(screen.getByText(PRIVACY.hidden)).toBeVisible();
  });
});

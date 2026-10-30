import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeaturesBento } from "./FeaturesBento";

describe("FeaturesBento", () => {
  it("the snapshot slider shows the version it points at", () => {
    render(<FeaturesBento />);
    const slider = screen.getByRole("slider", { name: "Snapshot version" });
    expect(screen.getByText(/of 5/)).toHaveTextContent("Version 5 of 5");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(screen.getByText(/of 5/)).toHaveTextContent("Version 2 of 5");
  });

  it("shows the final price without any effects", () => {
    render(<FeaturesBento />);
    expect(screen.getByText("$0")).toBeInTheDocument();
  });
});

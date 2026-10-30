import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockMatchMedia, REDUCED_MOTION_QUERY } from "@/test/matchMedia";
import { resetStoredValuesForTests } from "@/ui/lib/storedValue";
import { CALM_OFFER_KEY, CalmOffer } from "./CalmOffer";
import { CALM_STORAGE_KEY, MotionPreferencesProvider } from "./MotionPreferences";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MotionPreferencesProvider>{children}</MotionPreferencesProvider>
);

describe("CalmOffer (ADR 0011)", () => {
  let media: ReturnType<typeof mockMatchMedia>;
  beforeEach(() => {
    localStorage.clear();
    resetStoredValuesForTests();
    media = mockMatchMedia();
  });

  it("stays hidden with full motion", () => {
    render(<CalmOffer />, { wrapper });
    expect(screen.queryByRole("region", { name: "Motion" })).not.toBeInTheDocument();
  });

  it("offers Calm in gentle mode and turns it on with one tap", async () => {
    media.set(REDUCED_MOTION_QUERY, true);
    render(<CalmOffer />, { wrapper });
    const offer = screen.getByRole("region", { name: "Motion" });
    expect(offer).toHaveTextContent("Your device asks for less motion");
    await userEvent.click(screen.getByRole("button", { name: "Turn on Calm" }));
    expect(localStorage.getItem(CALM_STORAGE_KEY)).toBe("on");
    expect(localStorage.getItem(CALM_OFFER_KEY)).toBe("seen");
    expect(screen.queryByRole("region", { name: "Motion" })).not.toBeInTheDocument();
  });

  it("keeps motion and does not ask again", async () => {
    media.set(REDUCED_MOTION_QUERY, true);
    const first = render(<CalmOffer />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: "Keep motion" }));
    expect(localStorage.getItem(CALM_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole("region", { name: "Motion" })).not.toBeInTheDocument();
    first.unmount();
    render(<CalmOffer />, { wrapper });
    expect(screen.queryByRole("region", { name: "Motion" })).not.toBeInTheDocument();
  });
});

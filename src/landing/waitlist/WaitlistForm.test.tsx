import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WaitlistError } from "./api";
import { WaitlistForm } from "./WaitlistForm";

function setup(join = vi.fn(async () => ({ place: 42, refCode: "abc123" }))) {
  let clock = 0;
  const now = () => clock;
  render(<WaitlistForm join={join} now={now} />);
  clock = 5_000; // the visitor took 5 seconds
  return { join, user: userEvent.setup() };
}

describe("WaitlistForm (US16, US17)", () => {
  it("joins with the typed details and shows the ticket", async () => {
    const { join, user } = setup();
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("radio", { name: "Poetry" }));
    await user.type(screen.getByLabelText(/What slows you down/), "Indents vanish.");
    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));

    expect(join).toHaveBeenCalledWith({
      email: "ada@example.com",
      writerType: "poetry",
      painPoint: "Indents vanish.",
      referredBy: null,
    });
    expect(await screen.findByText("You're writer #42 on the Vlo list.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy your invite link" })).toBeInTheDocument();
    expect(screen.getByText(/\?ref=abc123$/)).toBeInTheDocument();
  });

  it("moves focus to the ticket after a sign-up, so keyboard users keep their place", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Email"), "ada@example.com{Enter}");
    const ticket = await screen.findByText("You're writer #42 on the Vlo list.");
    expect(ticket).toHaveFocus();
  });

  it("links the error message to the email field", async () => {
    const join = vi.fn(async () => {
      throw new WaitlistError("invalid_email");
    });
    const { user } = setup(join);
    await user.type(screen.getByLabelText("Email"), "ada@example{Enter}");
    const field = screen.getByLabelText("Email");
    expect(await screen.findByText("Please check the email address.")).toBeInTheDocument();
    expect(field).toHaveAccessibleDescription(/Please check the email address\./);
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("submits on Enter from the email field", async () => {
    const { join, user } = setup();
    await user.type(screen.getByLabelText("Email"), "ada@example.com{Enter}");
    expect(join).toHaveBeenCalledOnce();
  });

  it.each([
    ["invalid_email", "Please check the email address."],
    ["not_configured", "The waitlist opens soon. Please come back in a few days."],
    ["rate_limited", "Too many sign-ups at once. Please wait a minute and try again."],
    ["unavailable", "We could not reach the waitlist. Please try again."],
  ] as const)("shows a clear message for %s and keeps the email", async (code, message) => {
    const { user } = setup(vi.fn(async () => Promise.reject(new WaitlistError(code))));
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("blocks a submit when the honeypot has text", async () => {
    const { join, user } = setup();
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Website", { selector: "input" }), "spam");
    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));
    expect(join).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please take a moment");
  });

  it("blocks a submit made under 2 seconds after the form appears", async () => {
    const join = vi.fn();
    render(<WaitlistForm join={join} now={() => 0} />);
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com{Enter}");
    expect(join).not.toHaveBeenCalled();
  });

  it("sends one request at a time", async () => {
    let resolve: (v: { place: number; refCode: string }) => void = () => {};
    const join = vi.fn(() => new Promise<{ place: number; refCode: string }>((r) => (resolve = r)));
    const { user } = setup(join);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    const button = screen.getByRole("button", { name: "Join the waitlist" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(join).toHaveBeenCalledOnce();
    resolve({ place: 1, refCode: "x" });
    expect(await screen.findByText("You're writer #1 on the Vlo list.")).toBeInTheDocument();
  });
});

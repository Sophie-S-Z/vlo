import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { WAITLIST } from "../copy";
import {
  joinWaitlist,
  parseReferral,
  validateSubmission,
  WaitlistError,
  type JoinResult,
  type WaitlistErrorCode,
  type WriterType,
} from "./api";
import { playPaper } from "@/audio/sound";
import { useMotionPreferences } from "@/motion/MotionPreferences";
import { canFly, fly as flyPlane, shake as shakeForm } from "./flight";
import { HoldButton } from "./HoldButton";

const ERROR_TEXT: Record<WaitlistErrorCode | "bot", string> = {
  invalid_email: "Please check the email address.",
  not_configured: "The waitlist opens soon. Please come back in a few days.",
  rate_limited: "Too many sign-ups at once. Please wait a minute and try again.",
  unavailable: "We could not reach the waitlist. Please try again.",
  bot: "Please take a moment, then send the form again.",
};

export interface WaitlistFormProps {
  /** Injected in tests. */
  join?: typeof joinWaitlist;
  now?: () => number;
  /** The reply-to address for the consent line, when the human has given one. */
  contactEmail?: string;
  /** Injected in tests: the fold and plane flight after a sign-up. */
  fly?: (form: HTMLFormElement, plane: HTMLElement | null) => Promise<void>;
  /** Injected in tests: the shake after an error. */
  shake?: (form: HTMLFormElement) => void;
}

const defaultFly = canFly() ? flyPlane : undefined;
const defaultShake = canFly() ? shakeForm : undefined;

export function WaitlistForm({
  join = joinWaitlist,
  now = Date.now,
  contactEmail,
  fly = defaultFly,
  shake = defaultShake,
}: WaitlistFormProps) {
  const { reduced } = useMotionPreferences();
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const startedAt = useRef<number | null>(null);
  const [email, setEmail] = useState("");
  const [writerType, setWriterType] = useState<WriterType | undefined>(undefined);
  const [painPoint, setPainPoint] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counts failed submits, so the same message twice still shakes twice.
  const [failures, setFailures] = useState(0);
  const [flying, setFlying] = useState(false);
  const [result, setResult] = useState<JoinResult | null>(null);
  const [copied, setCopied] = useState(false);
  const ticketRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    startedAt.current = now();
  }, [now]);

  // The form, with the focused button, is gone after a sign-up; keep keyboard users in place.
  useEffect(() => {
    if (result) ticketRef.current?.focus();
  }, [result]);

  useEffect(() => {
    if (failures > 0 && !reduced && formRef.current) shake?.(formRef.current);
  }, [failures, reduced, shake]);

  function fail(message: string) {
    setError(message);
    setFailures((count) => count + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (
      validateSubmission({ honeypot, startedAt: startedAt.current ?? now(), now: now() }) === "bot"
    ) {
      fail(ERROR_TEXT.bot);
      return;
    }
    setBusy(true);
    try {
      const joined = await join({
        email,
        writerType,
        painPoint,
        referredBy: parseReferral(window.location.search),
      });
      playPaper();
      const form = formRef.current;
      if (fly && form && !reduced) {
        setFlying(true);
        const plane = form.closest("section")?.querySelector<HTMLElement>("[data-still-art=plane]");
        // The ticket matters more than the flight; a failed animation never hides it.
        await fly(form, plane ?? null).catch(() => {});
      }
      setResult(joined);
    } catch (caught) {
      fail(ERROR_TEXT[caught instanceof WaitlistError ? caught.code : "unavailable"]);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const invite = `${window.location.origin}/?ref=${result.refCode}`;
    return (
      <div data-ticket role="status" className="rounded-card border border-accent bg-surface p-8">
        <svg data-check viewBox="0 0 48 48" className="mb-4 size-12 text-accent" aria-hidden="true">
          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M14 25 L21 32 L35 17"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
          />
        </svg>
        <p ref={ticketRef} tabIndex={-1} className="font-display text-3xl outline-none">
          You&apos;re writer #{result.place} on the Vlo list.
        </p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(invite).then(() => setCopied(true));
          }}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-rule px-5 font-mono text-xs uppercase"
        >
          {copied && (
            <svg
              data-copy-check
              viewBox="0 0 16 16"
              className="size-4 text-accent"
              aria-hidden="true"
            >
              <path
                d="M3 8.5 L6.5 12 L13 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {copied ? "Copied" : "Copy your invite link"}
        </button>
        <p className="mt-3 font-mono text-xs break-all text-muted">{invite}</p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      inert={flying}
      aria-describedby={`${ids}-consent`}
      className="space-y-8"
    >
      <div className="relative">
        <input
          id={`${ids}-email`}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder=" "
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error === ERROR_TEXT.invalid_email || undefined}
          aria-describedby={error ? `${ids}-error` : undefined}
          className="peer min-h-14 w-full rounded-card border border-rule bg-surface px-4 pt-5 pb-2 font-serif text-xl text-fg outline-none focus:border-accent"
        />
        <label
          htmlFor={`${ids}-email`}
          className="pointer-events-none absolute top-1.5 left-4 font-mono text-[0.65rem] tracking-widest text-muted uppercase transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-placeholder-shown:tracking-normal peer-placeholder-shown:normal-case peer-focus:top-1.5 peer-focus:text-[0.65rem] peer-focus:tracking-widest peer-focus:uppercase"
        >
          {WAITLIST.emailLabel}
        </label>
      </div>

      <fieldset>
        <legend className="mb-3 font-mono text-xs tracking-widest text-muted uppercase">
          {WAITLIST.writeLabel}
        </legend>
        <div className="flex flex-wrap gap-2">
          {WAITLIST.writeOptions.map((option) => (
            <label key={option.value} className="cursor-pointer">
              <input
                type="radio"
                name="writer-type"
                value={option.value}
                checked={writerType === option.value}
                onChange={() => setWriterType(option.value)}
                className="peer sr-only"
              />
              <span className="inline-flex min-h-11 items-center rounded-full border border-rule px-4 text-sm peer-checked:border-accent peer-checked:bg-accent-text peer-checked:text-bg peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor={`${ids}-pain`}
          className="mb-2 block font-mono text-xs tracking-widest text-muted uppercase"
        >
          {WAITLIST.painLabel} <span className="normal-case">(optional)</span>
        </label>
        <textarea
          id={`${ids}-pain`}
          maxLength={280}
          rows={3}
          value={painPoint}
          onChange={(e) => setPainPoint(e.target.value)}
          aria-describedby={`${ids}-pain-count`}
          className="w-full rounded-card border border-rule bg-surface p-4 font-serif text-lg text-fg outline-none focus:border-accent"
        />
        <p id={`${ids}-pain-count`} className="mt-1 text-right font-mono text-xs text-muted">
          {painPoint.length} / 280
        </p>
      </div>

      {/* Honeypot: hidden from people and assistive technology; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${ids}-website`}>Website</label>
        <input
          id={`${ids}-website`}
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <HoldButton
          label={WAITLIST.submit}
          busyLabel="Saving…"
          busy={busy}
          className="inline-flex min-h-12 items-center rounded-full bg-accent-text px-7 text-base font-medium text-bg disabled:opacity-60"
        />
        <p id={`${ids}-consent`} className="max-w-sm font-mono text-xs text-muted">
          {WAITLIST.consent}
          {contactEmail ? ` Questions: ${contactEmail}.` : ""}
        </p>
      </div>

      <p id={`${ids}-error`} role="alert" className="min-h-6 font-serif text-lg text-accent-text">
        {error}
      </p>
    </form>
  );
}

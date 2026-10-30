import { netRequest } from "@/net/request";

export type WriterType = "novels" | "memoir" | "poetry" | "mixed";

export interface WaitlistConfig {
  url: string;
  anonKey: string;
}

export type WaitlistErrorCode = "invalid_email" | "not_configured" | "rate_limited" | "unavailable";

export class WaitlistError extends Error {
  constructor(readonly code: WaitlistErrorCode) {
    super(code);
    this.name = "WaitlistError";
  }
}

export interface JoinInput {
  email: string;
  writerType?: WriterType;
  painPoint?: string;
  referredBy?: string | null;
}

export interface JoinResult {
  place: number;
  refCode: string;
}

/** Reads the build-time Supabase settings. Null until the human adds them (spec section 3). */
export function readWaitlistConfig(): WaitlistConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/+$/, ""), anonKey } : null;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_FILL_MS = 2_000;

function rpc(
  config: WaitlistConfig,
  name: string,
  body: unknown,
  purpose: "waitlist" | "waitlist-count",
) {
  return netRequest({
    purpose,
    url: `${config.url}/rest/v1/rpc/${name}`,
    init: {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  });
}

const orNull = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

export async function joinWaitlist(
  input: JoinInput,
  config: WaitlistConfig | null = readWaitlistConfig(),
): Promise<JoinResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new WaitlistError("invalid_email");
  if (!config) throw new WaitlistError("not_configured");

  let response: Response;
  try {
    response = await rpc(
      config,
      "join_waitlist",
      {
        p_email: email,
        p_writer_type: input.writerType ?? null,
        p_pain_point: orNull(input.painPoint)?.slice(0, 280) ?? null,
        p_referred_by: orNull(input.referredBy),
      },
      "waitlist",
    );
  } catch {
    throw new WaitlistError("unavailable");
  }

  // One request only. A 429 never retries (spec section 12.7 applies the same rule to AI calls).
  if (response.status === 429) throw new WaitlistError("rate_limited");
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new WaitlistError(body?.message === "invalid_email" ? "invalid_email" : "unavailable");
  }
  const rows = (await response.json().catch(() => null)) as
    { out_place: number; out_ref_code: string }[] | null;
  const row = rows?.[0];
  if (!row) throw new WaitlistError("unavailable");
  return { place: Number(row.out_place), refCode: row.out_ref_code };
}

/** The live list size, or null when it cannot be read. Never invent a number (spec 18.4). */
export async function getWaitlistCount(
  config: WaitlistConfig | null = readWaitlistConfig(),
): Promise<number | null> {
  if (!config) return null;
  try {
    const response = await rpc(config, "waitlist_count", {}, "waitlist-count");
    if (!response.ok) return null;
    const value = Number(await response.json());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function validateSubmission({
  honeypot,
  startedAt,
  now,
}: {
  honeypot: string;
  startedAt: number;
  now: number;
}): "ok" | "bot" {
  return honeypot.trim() !== "" || now - startedAt < MIN_FILL_MS ? "bot" : "ok";
}

/** The ?ref= invite code: letters and digits only, at most 20 characters. */
export function parseReferral(search: string): string | null {
  const ref = new URLSearchParams(search).get("ref");
  return ref && /^[a-z0-9]{1,20}$/i.test(ref) ? ref : null;
}

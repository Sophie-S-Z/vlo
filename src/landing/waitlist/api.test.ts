import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNetLogForTests, getNetLog } from "@/net/log";
import {
  getWaitlistCount,
  joinWaitlist,
  parseReferral,
  validateSubmission,
  WaitlistError,
  type WaitlistConfig,
} from "./api";

const config: WaitlistConfig = { url: "https://abc.supabase.co", anonKey: "anon-key" };

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("joinWaitlist", () => {
  beforeEach(() => clearNetLogForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("calls the join_waitlist RPC with a trimmed, lower-case email", async () => {
    const fetchMock = mockFetch(200, [{ out_place: 7, out_ref_code: "a1b2c3d4e5" }]);
    const result = await joinWaitlist(
      {
        email: "  Ada@Example.COM ",
        writerType: "poetry",
        painPoint: "Indents.",
        referredBy: "zz",
      },
      config,
    );
    expect(result).toEqual({ place: 7, refCode: "a1b2c3d4e5" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://abc.supabase.co/rest/v1/rpc/join_waitlist");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("apikey")).toBe("anon-key");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer anon-key");
    expect(JSON.parse(init.body as string)).toEqual({
      p_email: "ada@example.com",
      p_writer_type: "poetry",
      p_pain_point: "Indents.",
      p_referred_by: "zz",
    });
    expect(getNetLog()).toHaveLength(1);
  });

  it("sends null for empty optional fields", async () => {
    const fetchMock = mockFetch(200, [{ out_place: 1, out_ref_code: "x" }]);
    await joinWaitlist({ email: "a@b.co", painPoint: "   " }, config);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toMatchObject({
      p_writer_type: null,
      p_pain_point: null,
      p_referred_by: null,
    });
  });

  it.each([
    [429, {}, "rate_limited"],
    [400, { message: "invalid_email" }, "invalid_email"],
    [503, {}, "unavailable"],
    [200, [], "unavailable"],
  ])("maps HTTP %i to %s and does not retry", async (status, body, code) => {
    const fetchMock = mockFetch(status, body);
    await expect(joinWaitlist({ email: "a@b.co" }, config)).rejects.toMatchObject({ code });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps a network failure to unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(joinWaitlist({ email: "a@b.co" }, config)).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("rejects a malformed email before any request", async () => {
    const fetchMock = mockFetch(200, []);
    await expect(joinWaitlist({ email: "nope" }, config)).rejects.toMatchObject({
      code: "invalid_email",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports not_configured when the Supabase settings are missing", async () => {
    await expect(joinWaitlist({ email: "a@b.co" }, null)).rejects.toBeInstanceOf(WaitlistError);
    await expect(joinWaitlist({ email: "a@b.co" }, null)).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("getWaitlistCount", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the count", async () => {
    mockFetch(200, 120);
    expect(await getWaitlistCount(config)).toBe(120);
  });

  it("returns null on any failure or without config", async () => {
    mockFetch(500, {});
    expect(await getWaitlistCount(config)).toBeNull();
    expect(await getWaitlistCount(null)).toBeNull();
  });
});

describe("validateSubmission (spec section 19 client rules)", () => {
  it("accepts a human submission", () => {
    expect(validateSubmission({ honeypot: "", startedAt: 0, now: 2_000 })).toBe("ok");
  });

  it("flags a filled honeypot", () => {
    expect(validateSubmission({ honeypot: "http://spam", startedAt: 0, now: 9_000 })).toBe("bot");
  });

  it("flags a form filled in under 2 seconds", () => {
    expect(validateSubmission({ honeypot: "", startedAt: 0, now: 1_999 })).toBe("bot");
  });
});

describe("parseReferral", () => {
  it.each([
    ["?ref=a1b2c3d4e5", "a1b2c3d4e5"],
    ["?ref=", null],
    ["?ref=<script>", null],
    ["?ref=" + "a".repeat(30), null],
    ["", null],
  ])("%s -> %s", (search, expected) => {
    expect(parseReferral(search)).toBe(expected);
  });
});

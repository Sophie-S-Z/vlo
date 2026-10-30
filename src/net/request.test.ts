import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNetLogForTests, getNetLog, subscribeNetLog } from "./log";
import { netRequest } from "./request";

describe("netRequest (spec section 7: one network module with a visible log)", () => {
  beforeEach(() => clearNetLogForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("sends the request and logs time, host, purpose, size and status", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ p_email: "a@b.co" });

    const response = await netRequest({
      purpose: "waitlist",
      url: "https://abc.supabase.co/rest/v1/rpc/join_waitlist",
      init: { method: "POST", body },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [entry] = getNetLog();
    expect(entry).toMatchObject({
      host: "abc.supabase.co",
      purpose: "waitlist",
      bytesSent: new TextEncoder().encode(body).length,
      status: 200,
    });
    expect(typeof entry?.time).toBe("number");
  });

  it("logs a failed request with status 0 and rethrows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(
      netRequest({
        purpose: "waitlist",
        url: "https://abc.supabase.co/x",
        init: { method: "POST", body: "12345" },
      }),
    ).rejects.toThrow("offline");
    // The body may have reached the server before the failure, so the log keeps its size.
    expect(getNetLog()[0]).toMatchObject({ purpose: "waitlist", status: 0, bytesSent: 5 });
  });

  it("never stores request content in the log", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("")),
    );
    await netRequest({
      purpose: "waitlist",
      url: "https://abc.supabase.co/rest/v1/rpc/join_waitlist?secret=1",
      init: { method: "POST", body: "private words" },
    });
    expect(JSON.stringify(getNetLog())).not.toMatch(/private words|secret/);
  });

  it("notifies subscribers on each new entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("")),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeNetLog(listener);
    await netRequest({ purpose: "waitlist-count", url: "https://abc.supabase.co/x" });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});

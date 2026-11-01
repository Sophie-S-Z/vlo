import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("loadApp (VITE_APP_ENABLED, ADR 0003)", () => {
  it.each([
    ["true", true],
    [undefined, false],
    ["", false],
    ["1", false],
    ["false", false],
    ["TRUE", false],
    [" true", false],
  ])("%j -> app enabled: %s", async (value, enabled) => {
    vi.stubEnv("VITE_APP_ENABLED", value);
    const { loadApp } = await import("./appLoader");
    expect(loadApp !== null).toBe(enabled);
  });
});

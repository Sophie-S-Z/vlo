import { afterEach, describe, expect, it, vi } from "vitest";
import {
  disableTilt,
  enableTilt,
  orientationToTilt,
  readTilt,
  subscribeTilt,
  tiltOn,
} from "./tilt";

type Orientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };

function stubOrientation(permission?: string) {
  class Stub extends Event {
    beta: number | null = null;
    gamma: number | null = null;
  }
  const stub = Stub as unknown as Orientation;
  if (permission) stub.requestPermission = vi.fn(async () => permission);
  vi.stubGlobal("DeviceOrientationEvent", stub);
  return stub;
}

function orient(beta: number, gamma: number) {
  const event = new Event("deviceorientation") as Event & { beta: number; gamma: number };
  event.beta = beta;
  event.gamma = gamma;
  window.dispatchEvent(event);
}

afterEach(() => {
  disableTilt();
  vi.unstubAllGlobals();
});

describe("orientationToTilt", () => {
  it("maps a phone held at 45 degrees to the center", () => {
    expect(orientationToTilt(45, 0)).toEqual({ x: 0, y: 0 });
  });

  it("maps 30 degrees of turn to the full range and clamps beyond it", () => {
    expect(orientationToTilt(45, 15)).toEqual({ x: 0.5, y: 0 });
    expect(orientationToTilt(0, -90)).toEqual({ x: -1, y: -1 });
  });

  it("treats missing readings as the center", () => {
    expect(orientationToTilt(null, null)).toEqual({ x: 0, y: 0 });
  });
});

describe("enableTilt (spec 18.1 item 11)", () => {
  it("asks for permission where the browser needs it, then follows the device", async () => {
    const stub = stubOrientation("granted");
    const listener = vi.fn();
    subscribeTilt(listener);
    expect(await enableTilt()).toBe(true);
    expect(stub.requestPermission).toHaveBeenCalledOnce();
    expect(tiltOn()).toBe(true);
    expect(document.documentElement.dataset.tilt).toBe("on");
    orient(45, 15);
    expect(readTilt()).toEqual({ x: 0.5, y: 0 });
    expect(document.documentElement.style.getPropertyValue("--tilt-x")).toBe("0.500");
    expect(listener).toHaveBeenCalled();
  });

  it("stays off when the visitor declines", async () => {
    stubOrientation("denied");
    expect(await enableTilt()).toBe(false);
    expect(tiltOn()).toBe(false);
  });

  it("turns off and clears the variables", async () => {
    stubOrientation();
    await enableTilt();
    orient(45, 15);
    disableTilt();
    orient(45, 30);
    expect(tiltOn()).toBe(false);
    expect(readTilt()).toEqual({ x: 0, y: 0 });
    expect(document.documentElement.dataset.tilt).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--tilt-x")).toBe("");
  });
});

/**
 * Gyroscope parallax (spec 18.1 item 11). Phones start it with an "Enable motion" tap, because
 * iOS asks for permission inside a tap. The tilt runs from -1 to 1 on each axis; the particle
 * field, the still art and the word tiles follow it a little.
 */
export interface Tilt {
  x: number;
  y: number;
}

/** Degrees of turn for the full range. */
const RANGE = 30;
/** The usual angle at which people hold a phone. */
const REST_BETA = 45;

const CENTER: Tilt = { x: 0, y: 0 };
let current = CENTER;
let on = false;
const listeners = new Set<() => void>();

const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

export function orientationToTilt(beta: number | null, gamma: number | null): Tilt {
  return {
    x: round(clamp((gamma ?? 0) / RANGE)) || 0,
    y: round(clamp(((beta ?? REST_BETA) - REST_BETA) / RANGE)) || 0,
  };
}

type OrientationConstructor = { requestPermission?: () => Promise<string> };

export function tiltSupported(): boolean {
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
}

const notify = () => listeners.forEach((listener) => listener());

function onOrientation(event: DeviceOrientationEvent) {
  current = orientationToTilt(event.beta, event.gamma);
  const root = document.documentElement.style;
  root.setProperty("--tilt-x", current.x.toFixed(3));
  root.setProperty("--tilt-y", current.y.toFixed(3));
  notify();
}

/** Starts the tilt. Call it from a tap. Returns false when the visitor declines. */
export async function enableTilt(): Promise<boolean> {
  if (on) return true;
  if (!tiltSupported()) return false;
  const request = (window.DeviceOrientationEvent as unknown as OrientationConstructor)
    .requestPermission;
  if (request) {
    const answer = await request().catch(() => "denied");
    if (answer !== "granted") return false;
  }
  on = true;
  window.addEventListener("deviceorientation", onOrientation);
  document.documentElement.dataset.tilt = "on";
  notify();
  return true;
}

export function disableTilt(): void {
  if (!on) return;
  on = false;
  current = CENTER;
  window.removeEventListener("deviceorientation", onOrientation);
  const root = document.documentElement;
  delete root.dataset.tilt;
  root.style.removeProperty("--tilt-x");
  root.style.removeProperty("--tilt-y");
  notify();
}

export const tiltOn = (): boolean => on;
export const readTilt = (): Tilt => current;

export function subscribeTilt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

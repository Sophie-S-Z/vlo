import { readStorage, writeStorage } from "@/ui/lib/storage";
import type { Engine } from "./engine";

/**
 * Sound state (spec 18.1 item 10, ADR 0012). Sound is on by default, but a browser lets audio
 * start only after a click or key press, so `armSound` waits for the first one. A visitor who
 * turns sound off keeps it off (`vlo:sound`). The Web Audio engine loads through import() on
 * the first start.
 */
export const SOUND_KEY = "vlo:sound";

let on = false;
let engine: Engine | undefined;
let loading: Promise<Engine> | undefined;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

function loadEngine(): Promise<Engine> {
  loading ??= import("./engine").then(({ createEngine }) => (engine = createEngine()));
  return loading;
}

export function soundOn(): boolean {
  return on;
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSound(next: boolean): void {
  if (next === on) return;
  on = next;
  notify();
  if (on) {
    void loadEngine()
      .then((loaded) => (on ? loaded.start() : undefined))
      .catch((error: unknown) => {
        console.warn("Sound did not start.", error);
        on = false;
        notify();
      });
  } else {
    engine?.stop();
  }
}

/** False only when the visitor turned sound off. */
export function soundWanted(): boolean {
  return readStorage(SOUND_KEY) !== "off";
}

/** The visitor's own choice: it starts or stops sound and lasts across visits. */
export function chooseSound(next: boolean): void {
  writeStorage(SOUND_KEY, next ? "on" : "off");
  setSound(next);
}

/** Controls that make their own sound choice; a press on them does not arm sound. */
const OWN_CHOICE = "[data-sound-switch], [data-entry-curtain]";

/**
 * Starts sound on the first click or key press on the page, unless the visitor turned it off.
 * Returns the function that stops waiting.
 */
export function armSound(): () => void {
  if (on || !soundWanted()) return () => {};
  const start = (event: Event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(OWN_CHOICE)) return;
    disarm();
    if (soundWanted()) setSound(true);
  };
  const disarm = () => {
    window.removeEventListener("pointerdown", start, true);
    window.removeEventListener("keydown", start, true);
  };
  window.addEventListener("pointerdown", start, true);
  window.addEventListener("keydown", start, true);
  return disarm;
}

/** The audio level from 0 to 1, for the switch bars. */
export function soundLevel(): number {
  return on && engine ? engine.level() : 0;
}

/** A short paper sound, for a successful sign-up. Silent while sound is off. */
export function playPaper(): void {
  if (on) engine?.paper();
}

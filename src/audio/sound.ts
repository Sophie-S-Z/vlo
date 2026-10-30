import type { Engine } from "./engine";

/**
 * Sound state (spec 18.1 item 10). Sound is off on every visit and starts only after the
 * visitor turns it on. The Web Audio engine loads through import() on that first choice.
 */
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

/** The audio level from 0 to 1, for the switch bars. */
export function soundLevel(): number {
  return on && engine ? engine.level() : 0;
}

/** A short paper sound, for a successful sign-up. Silent while sound is off. */
export function playPaper(): void {
  if (on) engine?.paper();
}

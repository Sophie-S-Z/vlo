/**
 * Ink lab settings (spec 18.1 item 12): the hidden panel changes these, and the particle field
 * and the film grain follow them. The values last for this page view only.
 */
export interface LabSettings {
  /** Share of the particles drawn, from 0.1 to 1. */
  particles: number;
  /** Ink color for the accent particles and the hero ink. Empty uses the theme accent. */
  ink: string;
  /** Film grain opacity, from 0 to 0.15 (spec section 17: 4 to 5%). */
  grain: number;
  /** Bloom intensity, from 0 to 3. */
  bloom: number;
}

export const DEFAULT_LAB: LabSettings = { particles: 1, ink: "", grain: 0.045, bloom: 0.35 };

let settings = { ...DEFAULT_LAB };
const listeners = new Set<() => void>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const labSettings = (): LabSettings => settings;

export function setLab(change: Partial<LabSettings>): void {
  const next = { ...settings, ...change };
  settings = {
    particles: clamp(next.particles, 0.1, 1),
    ink: next.ink,
    grain: clamp(next.grain, 0, 0.15),
    bloom: clamp(next.bloom, 0, 3),
  };
  document.documentElement.style.setProperty("--vlo-grain", String(settings.grain));
  listeners.forEach((listener) => listener());
}

export function subscribeLab(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetLabForTests(): void {
  settings = { ...DEFAULT_LAB };
  listeners.clear();
  open = false;
  openListeners.clear();
  document.documentElement.style.removeProperty("--vlo-grain");
}

// Whether the Ink lab panel is open. The "~" key and the footer button both change it.
let open = false;
const openListeners = new Set<() => void>();

export const inkLabOpen = (): boolean => open;

export function setInkLabOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  openListeners.forEach((listener) => listener());
}

export function subscribeInkLabOpen(listener: () => void): () => void {
  openListeners.add(listener);
  return () => openListeners.delete(listener);
}

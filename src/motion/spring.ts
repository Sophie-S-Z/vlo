import { spring } from "motion";
import { animate } from "motion/mini";

/** Spring motion token (M1 plan): stiffness 300, damping 30. */
export const SPRING = { type: spring, stiffness: 300, damping: 30 } as const;

type Keyframes = Parameters<typeof animate>[1];
type Options = Parameters<typeof animate>[2];

/**
 * A spring on the Web Animations API (ADR 0012). `motion/mini` turns the spring into a
 * `linear()` easing, so the browser runs it off the main thread where it can. Returns null when
 * the browser has no `Element.animate`.
 */
export function springTo(element: Element, keyframes: Keyframes, options?: Options) {
  if (typeof element.animate !== "function") return null;
  return animate(element, keyframes, { ...SPRING, ...options });
}

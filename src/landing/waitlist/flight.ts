/**
 * Sign-up flight (spec 18.3 p.10): the form folds into a paper plane, then the plane art flies
 * off on a curve. The landing particle plane follows the plane art, so both fly together. It
 * uses the Web Animations API only, so it adds no library to the first load.
 */

/** The form folds from a page into a dart. Every frame has six points, so they tween. */
export const FOLD_FRAMES: Keyframe[] = [
  {
    clipPath: "polygon(0% 0%, 50% 0%, 100% 0%, 100% 100%, 50% 100%, 0% 100%)",
    transform: "scale(1)",
    opacity: 1,
  },
  {
    clipPath: "polygon(0% 0%, 50% 0%, 100% 0%, 100% 60%, 50% 100%, 0% 60%)",
    transform: "scale(0.85)",
    opacity: 1,
  },
  {
    clipPath: "polygon(0% 50%, 50% 46%, 100% 30%, 100% 30%, 55% 70%, 0% 50%)",
    transform: "scale(0.45) rotate(-8deg)",
    opacity: 0,
  },
];

const FOLD_MS = 650;
const FLIGHT_MS = 1100;
const RETURN_MS = 450;
const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

/** Points on a cubic Bezier curve. */
function bezier(t: number, a: number, b: number, c: number, d: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/**
 * Keyframes for the plane along a curve that dips a little, then climbs off the top right of
 * the screen. The nose follows the tangent of the curve.
 */
export function flightFrames(viewport: { width: number; height: number }, steps = 24): Keyframe[] {
  const { width, height } = viewport;
  const xs = [0, width * 0.15, width * 0.55, width * 1.1] as const;
  const ys = [0, height * 0.18, -height * 0.1, -height * 1.1] as const;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = bezier(t, ...xs);
    const y = bezier(t, ...ys);
    const [before, after] = [Math.max(0, t - 0.01), Math.min(1, t + 0.01)];
    const dx = bezier(after, ...xs) - bezier(before, ...xs);
    const dy = bezier(after, ...ys) - bezier(before, ...ys);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    frames.push({
      offset: t,
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg)`,
    });
  }
  return frames;
}

/** True when the browser can run the flight. Callers also check reduced motion and Calm. */
export function canFly(): boolean {
  return typeof Element !== "undefined" && typeof Element.prototype.animate === "function";
}

/** Folds the form, flies the plane art, and brings the plane art back to its place. */
export async function fly(form: HTMLElement, plane: HTMLElement | null): Promise<void> {
  await form.animate(FOLD_FRAMES, { duration: FOLD_MS, easing: EASE, fill: "forwards" }).finished;
  if (!plane) return;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  await plane.animate(flightFrames(viewport), { duration: FLIGHT_MS, easing: "ease-in" }).finished;
  // The plane lands back in its place quietly; it does not block the ticket.
  plane.animate([{ opacity: 0 }, { opacity: 1 }], { duration: RETURN_MS, easing: EASE });
}

/** A short, gentle shake for a failed sign-up. */
export function shake(element: HTMLElement): void {
  element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 360, easing: "ease-out" },
  );
}

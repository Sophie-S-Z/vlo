import { gsap, ScrollTrigger } from "@/motion/gsap";
import { inkLine, navHide, navHover, pageCounter } from "./chrome";
import { bento, cardToDialog } from "./demos";
import { startLenis } from "./lenis";
import { cursor, magnetic, tilt } from "./pointer";
import { hero, manifesto, marquees, velocitySkew } from "./text";
import type { Effect, Teardown } from "./types";

const EFFECTS: Effect[] = [
  inkLine,
  pageCounter,
  navHide,
  navHover,
  cursor,
  magnetic,
  tilt,
  hero,
  manifesto,
  velocitySkew,
  marquees,
  bento,
  cardToDialog,
];

/**
 * Starts the landing page's HTML-level effects (spec 18.1). Load this module only through
 * import(), and only when motion is not reduced. The returned teardown undoes every tween,
 * ScrollTrigger, listener and DOM change, so Calm can switch everything off mid-page.
 */
export function startLandingEffects(root: HTMLElement): Teardown {
  const teardowns: Teardown[] = [];
  const context = gsap.context(() => {
    for (const effect of EFFECTS) {
      const teardown = effect(root);
      if (teardown) teardowns.push(teardown);
    }
  }, root);
  const stopLenis = startLenis(root);
  ScrollTrigger.refresh();

  return () => {
    stopLenis();
    context.revert();
    for (const teardown of teardowns.reverse()) teardown();
  };
}

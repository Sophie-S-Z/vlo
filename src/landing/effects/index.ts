import { gsap, ScrollTrigger } from "@/motion/gsap";
import { inkLine, navHide, navHover, pageCounter } from "./chrome";
import { bento, cardToDialog } from "./demos";
import { field } from "./field";
import { firstLines } from "./firstLines";
import { formsTrack, magnets, memoirNames, novelBoard } from "./forms";
import { startLenis } from "./lenis";
import { privacy } from "./privacy";
import { cursor, magnetic, tilt } from "./pointer";
import { hero, manifesto, marquees, velocitySkew } from "./text";
import type { Effect, Teardown } from "./types";

/** Effects for the nav and the first screen start at once. */
const FIRST: Effect[] = [inkLine, pageCounter, navHide, navHover, cursor, magnetic, hero, field];

/**
 * Section demos below the fold start one per task, so no single long task blocks input while
 * they set up (Lighthouse TBT).
 */
const LATER: Effect[] = [
  // The pin first: ScrollTriggers below a pin must be created after it to count its spacer.
  formsTrack,
  manifesto,
  velocitySkew,
  marquees,
  tilt,
  novelBoard,
  memoirNames,
  magnets,
  privacy,
  firstLines,
  bento,
  cardToDialog,
];

/**
 * Starts the landing page's HTML-level effects (spec 18.1). Load this module only through
 * import(), and only when motion is not reduced. The returned teardown undoes every tween,
 * ScrollTrigger, listener and DOM change, so Calm can switch everything off mid-page. It also
 * cancels the effects that have not started yet.
 */
export function startLandingEffects(root: HTMLElement): Teardown {
  const teardowns: Teardown[] = [];
  const context = gsap.context(() => {}, root);
  let timer = 0;
  let stopped = false;
  const run = (effect: Effect) =>
    context.add(() => {
      const teardown = effect(root);
      if (teardown) teardowns.push(teardown);
    });
  const teardownAll = () => {
    stopped = true;
    clearTimeout(timer);
    delete document.documentElement.dataset.effects;
    context.revert();
    for (const teardown of teardowns.reverse()) teardown();
    teardowns.length = 0;
  };
  try {
    for (const effect of FIRST) run(effect);
    teardowns.unshift(startLenis(root));
    ScrollTrigger.refresh();
  } catch (error) {
    // Undo whatever already started, so a failed start never leaves effects Calm cannot stop.
    teardownAll();
    throw error;
  }

  const queue = [...LATER];
  const next = () => {
    const effect = queue.shift();
    if (stopped) return;
    if (!effect) {
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
      // Tests and tools wait for this before they use the section demos.
      document.documentElement.dataset.effects = "ready";
      return;
    }
    try {
      run(effect);
    } catch (error) {
      // One failed demo keeps its static markup; the rest still start.
      console.warn("A landing effect did not start.", error);
    }
    timer = window.setTimeout(next, 0);
  };
  timer = window.setTimeout(next, 0);
  return teardownAll;
}

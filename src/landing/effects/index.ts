import { gsap, ScrollTrigger } from "@/motion/gsap";
import { inkLine, navHide, navHover, pageCounter } from "./chrome";
import { field } from "./field";
import { startLenis } from "./lenis";
import { cursor, keyWeight, magnetic, tilt } from "./pointer";
import { hero, manifesto, marquees, velocitySkew } from "./text";
import type { Effect, Teardown } from "./types";

/** The first screen's headline starts at once; the canvas loads its own chunk. */
const FIRST: Effect[] = [hero, field];

const now = (effect: Effect) => async () => effect;
const forms = () => import("./forms");
const demos = () => import("./demos");

/**
 * The other effects start one per task, so no single long task blocks input while they set up
 * (Lighthouse TBT). The section demos load in their own chunks, so the parse is split too.
 */
const LATER: (() => Promise<Effect>)[] = [
  // Nav and pointer effects first, one per task.
  now(inkLine),
  now(pageCounter),
  now(navHide),
  now(navHover),
  now(cursor),
  now(magnetic),
  now(keyWeight),
  // The pins next, top to bottom: ScrollTriggers below a pin must be created after it to count
  // its spacer.
  () => import("./book").then((m) => m.bookStory),
  () => forms().then((m) => m.formsTrack),
  now(manifesto),
  now(velocitySkew),
  now(marquees),
  now(tilt),
  () => forms().then((m) => m.novelBoard),
  () => forms().then((m) => m.memoirNames),
  () => forms().then((m) => m.magnets),
  () => import("./privacy").then((m) => m.privacy),
  () => import("./firstLines").then((m) => m.firstLines),
  () => demos().then((m) => m.bento),
  () => demos().then((m) => m.cardToDialog),
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
    const load = queue.shift();
    if (stopped) return;
    if (!load) {
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
      // Tests and tools wait for this before they use the section demos.
      document.documentElement.dataset.effects = "ready";
      return;
    }
    load()
      .then((effect) => {
        if (stopped) return;
        run(effect);
      })
      .catch((error: unknown) => {
        // One failed demo keeps its static markup; the rest still start.
        console.warn("A landing effect did not start.", error);
      })
      .finally(() => {
        if (!stopped) timer = window.setTimeout(next, 0);
      });
  };
  timer = window.setTimeout(next, 0);
  return teardownAll;
}

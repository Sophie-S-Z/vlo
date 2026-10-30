import { ScrollTrigger } from "@/motion/gsap";
import { springTo } from "@/motion/spring";
import { setBookOpen } from "./bookState";
import type { Teardown } from "./types";

/** Screens of scroll the story holds the page for. Phones get a shorter story. */
const PIN_SCREENS = { wide: 4, narrow: 2.5 };
/** The iris starts here, as a share of the pin. */
const IRIS_FROM = 0.85;

/**
 * "The book opens" as a pinned story (spec 18.3 p.03, Lovable merge, ADR 0012). The section
 * holds for four screens. One caption shows per step and springs in. The particle book turns
 * and lifts its pages with scroll. A circle iris in the inverse color closes the story. Calm
 * keeps the still list of captions.
 */
export function bookStory(root: HTMLElement): Teardown | void {
  const section = root.querySelector<HTMLElement>("#book");
  const steps = Array.from(section?.querySelectorAll<HTMLElement>("[data-book-steps] > li") ?? []);
  if (!section || steps.length === 0) return;

  section.dataset.story = "";
  // Only the active caption shows; screen readers hear each one as it arrives.
  const list = steps[0]!.parentElement!;
  list.setAttribute("aria-live", "polite");
  const iris = document.createElement("div");
  iris.dataset.bookIris = "";
  iris.setAttribute("aria-hidden", "true");
  section.append(iris);

  let active = -1;
  let running: { cancel: () => void } | null = null;
  const show = (index: number) => {
    if (index === active) return;
    const previous = steps[active];
    if (previous) delete previous.dataset.active;
    active = index;
    const step = steps[index]!;
    step.dataset.active = "";
    running?.cancel();
    // Clip instead of fading: the caption keeps full contrast at every frame.
    running = springTo(step, {
      translate: ["0 1.2em", "0 0"],
      clipPath: ["inset(0 0 100% 0)", "inset(0 0 0 0)"],
    });
  };
  show(0);

  const screens = matchMedia("(min-width: 768px)").matches ? PIN_SCREENS.wide : PIN_SCREENS.narrow;
  const trigger = ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: () => `+=${window.innerHeight * screens}`,
    pin: true,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      const p = self.progress;
      setBookOpen(Math.min(1, p / IRIS_FROM));
      show(Math.min(steps.length - 1, Math.floor((p / IRIS_FROM) * steps.length)));
      const reveal = Math.max(0, (p - IRIS_FROM) / (1 - IRIS_FROM));
      iris.style.clipPath = `circle(${(reveal * 75).toFixed(2)}% at 50% 50%)`;
    },
  });

  return () => {
    trigger.kill(true);
    running?.cancel();
    setBookOpen(0);
    iris.remove();
    delete section.dataset.story;
    list.removeAttribute("aria-live");
    for (const step of steps) delete step.dataset.active;
  };
}

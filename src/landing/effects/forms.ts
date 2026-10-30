import { gsap } from "@/motion/gsap";
import type { Teardown } from "./types";

const WIDE = "(min-width: 1024px)";

/**
 * The Three forms track (spec 18.3 p.04). On wide screens the panels sit in one row and the
 * section pins while the row moves left; phones keep the vertical stack (spec 18.1 item 11).
 * `onTrack` receives the row tween, so panel effects can use it as their containerAnimation.
 */
export function formsTrack(
  root: HTMLElement,
  onTrack: (track: gsap.core.Tween | null) => void = () => {},
): Teardown | void {
  const section = root.querySelector<HTMLElement>("#forms");
  const track = section?.querySelector<HTMLElement>("[data-forms-track]");
  if (!section || !track) return;
  const mm = gsap.matchMedia();
  mm.add({ wide: WIDE, narrow: `not all and ${WIDE}` }, (context) => {
    if (!context.conditions?.wide) {
      onTrack(null);
      return;
    }
    track.dataset.track = "row";
    // The row ends with its last panel at the same inset the first one started with.
    const distance = () => track.scrollWidth - (section.clientWidth - track.offsetLeft * 2);
    const tween = gsap.to(track, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
      },
    });
    onTrack(tween);
    return () => {
      delete track.dataset.track;
      onTrack(null);
    };
  });
  return () => mm.revert();
}

import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/motion/gsap";
import { listen, type Teardown } from "./types";

const NAV_OFFSET = -72;

let active: Lenis | null = null;

/** Scrolls to a target through the running Lenis, or natively when Lenis is off. */
export function glideTo(target: HTMLElement, options: { immediate?: boolean } = {}): void {
  if (active) active.scrollTo(target, { offset: NAV_OFFSET, immediate: options.immediate });
  else target.scrollIntoView({ behavior: options.immediate ? "instant" : "smooth" });
}

/**
 * Lenis smooth scroll synced to ScrollTrigger (spec 18.1 item 1), plus an anchor glide.
 * The glide keeps native hash behavior: it updates the URL and moves focus to the target.
 */
export function startLenis(root: HTMLElement): Teardown {
  const lenis = new Lenis({ stopInertiaOnNavigate: true });
  active = lenis;
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  const stopClicks = listen(root, "click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    const hash = link?.getAttribute("href");
    if (!link || !hash || hash === "#" || link.hasAttribute("data-skip-link")) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    lenis.scrollTo(target, {
      offset: hash === "#top" ? 0 : NAV_OFFSET,
      onComplete: () => {
        history.replaceState(null, "", hash);
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      },
    });
  });

  return () => {
    stopClicks();
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33);
    lenis.destroy();
    if (active === lenis) active = null;
  };
}

import { gsap, ScrollTrigger } from "@/motion/gsap";
import { keepChildren, listen, setText, type Teardown } from "./types";

/** Ink line under the nav fills with page progress (spec 18.1 item 2). */
export function inkLine(root: HTMLElement): void {
  const line = root.querySelector("[data-ink-line]");
  if (!line) return;
  gsap.fromTo(
    line,
    { scaleX: 0 },
    {
      scaleX: 1,
      ease: "none",
      scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
    },
  );
}

/** "p. 01 / 10" with an odometer roll; reads "Last page" on the waitlist (spec 18.1 item 3). */
export function pageCounter(root: HTMLElement): Teardown | void {
  const counter = root.querySelector<HTMLElement>("[data-page-counter]");
  if (!counter) return;
  const nodes = Array.from(counter.childNodes);
  const current = counter.querySelector<HTMLElement>("[data-page-current]");
  const first = current?.textContent ?? "";
  const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
  const last = pages.at(-1)?.dataset.page;

  const show = (page: string) => {
    if (page === last) counter.replaceChildren("Last page");
    else {
      counter.replaceChildren(...nodes);
      if (current) setText(current, page);
    }
    gsap.fromTo(
      page === last || !current ? counter : current,
      { yPercent: 60, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.45, ease: "vlo" },
    );
  };

  for (const page of pages) {
    ScrollTrigger.create({
      trigger: page,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => {
        if (self.isActive && page.dataset.page) show(page.dataset.page);
      },
    });
  }
  return () => {
    gsap.killTweensOf([counter, current]);
    gsap.set([counter, current], { clearProps: "all" });
    counter.replaceChildren(...nodes);
    if (current) setText(current, first);
  };
}

/** The nav hides on scroll down and returns on scroll up (spec 18.1 item 4). */
export function navHide(root: HTMLElement): Teardown | void {
  const nav = root.querySelector<HTMLElement>("[data-nav]");
  if (!nav) return;
  const show = gsap.to(nav, { yPercent: -100, duration: 0.4, ease: "vlo", paused: true });
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      const focused = nav.contains(document.activeElement);
      if (self.direction === 1 && self.scroll() > 120 && !focused) show.play();
      else show.reverse();
    },
  });
  return listen(nav, "focusin", () => show.reverse());
}

const NIB = "M16 4C20 10 24 13 24 18L16 28 8 18C8 13 12 10 16 4Z";

/** Logo morphs from a "V" to a pen nib on hover; links scramble on hover (spec 18.1 item 4). */
export function navHover(root: HTMLElement): Teardown {
  const stops: Teardown[] = [];
  const logo = root.querySelector<HTMLElement>("[data-logo]");
  const path = logo?.querySelector("[data-logo-path]");
  if (logo && path) {
    const morph = gsap.to(path, { morphSVG: NIB, duration: 0.5, ease: "vlo", paused: true });
    stops.push(
      listen(logo, "pointerenter", () => morph.play()),
      listen(logo, "pointerleave", () => morph.reverse()),
    );
  }
  for (const link of root.querySelectorAll<HTMLElement>("[data-scramble]")) {
    const text = link.textContent ?? "";
    const restore = keepChildren(link);
    const hadLabel = link.hasAttribute("aria-label");
    if (!hadLabel) link.setAttribute("aria-label", text);
    stops.push(
      listen(link, "pointerenter", () => {
        gsap.to(link, {
          duration: 0.6,
          scrambleText: { text, chars: "upperCase", speed: 0.5 },
          overwrite: true,
        });
      }),
      () => {
        gsap.killTweensOf(link);
        restore();
        if (!hadLabel) link.removeAttribute("aria-label");
      },
    );
  }
  return () => stops.forEach((stop) => stop());
}

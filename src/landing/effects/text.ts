import { gsap, ScrollTrigger, SplitText } from "@/motion/gsap";
import type { Teardown } from "./types";

/** Hero headline rises in by line; rotating word; spinning badge (spec 18.3 p.01). */
export function hero(root: HTMLElement): Teardown {
  const stops: Teardown[] = [];
  const title = root.querySelector<HTMLElement>("[data-reveal-lines]");
  if (title) {
    const split = SplitText.create(title, { type: "lines", mask: "lines", aria: "auto" });
    gsap.from(split.lines, { yPercent: 105, duration: 1.1, ease: "vlo", stagger: 0.09 });
    stops.push(() => split.revert());
  }

  const rotator = root.querySelector<HTMLElement>("[data-rotate]");
  const words = rotator?.dataset.rotate?.split("|") ?? [];
  if (rotator && words.length > 1) {
    const first = rotator.textContent;
    const timeline = gsap.timeline({ repeat: -1 });
    words.forEach((_, i) => {
      const next = words[(i + 1) % words.length]!;
      timeline
        .to(rotator, { yPercent: -40, opacity: 0, duration: 0.35, ease: "vlo", delay: 2.2 })
        .call(() => {
          rotator.textContent = next;
        })
        .fromTo(
          rotator,
          { yPercent: 40 },
          { yPercent: 0, opacity: 1, duration: 0.35, ease: "vlo" },
        );
    });
    gsap.set(rotator, { display: "inline-block" });
    stops.push(() => {
      rotator.textContent = first;
    });
  }

  for (const badge of root.querySelectorAll("[data-spin]")) {
    gsap.to(badge, {
      rotation: 360,
      duration: 24,
      ease: "none",
      repeat: -1,
      transformOrigin: "50% 50%",
    });
  }
  const band = root.querySelector("[data-word-band]");
  if (band) {
    gsap.to(band, {
      xPercent: -30,
      ease: "none",
      scrollTrigger: { trigger: band, start: "top top", end: "bottom+=600 top", scrub: true },
    });
  }
  return () => stops.forEach((stop) => stop());
}

/** Manifesto words fill with ink as you read; the closing line flies in (spec 18.3 p.02). */
export function manifesto(root: HTMLElement): void {
  for (const block of root.querySelectorAll<HTMLElement>("[data-scroll-fill]")) {
    gsap.fromTo(
      block.querySelectorAll("[data-word]"),
      { "--fill": 0 },
      {
        "--fill": 1,
        ease: "none",
        stagger: 0.1,
        scrollTrigger: { trigger: block, start: "top 80%", end: "bottom 45%", scrub: true },
      },
    );
  }
  for (const line of root.querySelectorAll("[data-fly-in]")) {
    gsap.from(line, {
      xPercent: -12,
      opacity: 0,
      duration: 1.1,
      ease: "vlo",
      scrollTrigger: { trigger: line, start: "top 85%" },
    });
  }
}

/** Large section titles lean with scroll speed (spec 18.1 item 9). */
export function velocitySkew(root: HTMLElement): void {
  const titles = root.querySelectorAll("[data-page] h2:not(.sr-only)");
  if (titles.length === 0) return;
  const proxy = { skew: 0 };
  const setSkew = gsap.quickSetter(titles, "skewY", "deg");
  const clamp = gsap.utils.clamp(-5, 5);
  ScrollTrigger.create({
    onUpdate: (self) => {
      const skew = clamp(self.getVelocity() / -400);
      if (Math.abs(skew) > Math.abs(proxy.skew)) {
        proxy.skew = skew;
        gsap.to(proxy, {
          skew: 0,
          duration: 0.8,
          ease: "power3",
          overwrite: true,
          onUpdate: () => setSkew(proxy.skew),
        });
      }
    },
  });
}

/** Looping word rows and the footer ticker; they pause off screen. */
export function marquees(root: HTMLElement): void {
  for (const row of root.querySelectorAll<HTMLElement>("[data-marquee], [data-ticker]")) {
    const reverse = row.dataset.marquee === "-1";
    gsap.fromTo(
      row,
      { xPercent: reverse ? -50 : 0 },
      {
        xPercent: reverse ? 0 : -50,
        duration: row.hasAttribute("data-ticker") ? 60 : 40,
        ease: "none",
        repeat: -1,
        scrollTrigger: {
          trigger: row,
          start: "top bottom",
          end: "bottom top",
          toggleActions: "play pause resume pause",
        },
      },
    );
  }
}

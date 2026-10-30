import { gsap, ScrollTrigger, SplitText } from "@/motion/gsap";
import { springTo } from "@/motion/spring";
import { gentleMotion, setText, type Teardown } from "./types";

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
  if (rotator && words.length > 1) stops.push(rotateWords(rotator, words));

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

const WORD_HOLD_MS = 2400;

/**
 * The hero's rotating word (spec 18.3 p.01). The word clips out upward, then the next word
 * springs up from below (Lovable merge, ADR 0012). Clipping keeps full text contrast.
 */
function rotateWords(rotator: HTMLElement, words: string[]): Teardown {
  const first = rotator.textContent ?? "";
  let index = 0;
  let timer = 0;
  let running: Animation | { cancel: () => void } | null = null;
  rotator.style.display = "inline-block";
  const next = () => {
    const leave = rotator.animate(
      [
        { translate: "0 0", clipPath: "inset(0 0 0 0)" },
        { translate: "0 -0.5em", clipPath: "inset(0 0 100% 0)" },
      ],
      { duration: 260, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
    );
    running = leave;
    leave.onfinish = () => {
      index = (index + 1) % words.length;
      setText(rotator, words[index]!);
      leave.cancel();
      running = springTo(rotator, {
        translate: ["0 0.6em", "0 0"],
        clipPath: ["inset(100% 0 0 0)", "inset(0 0 0 0)"],
      });
      timer = window.setTimeout(next, WORD_HOLD_MS);
    };
  };
  timer = window.setTimeout(next, WORD_HOLD_MS);
  return () => {
    window.clearTimeout(timer);
    running?.cancel();
    rotator.style.removeProperty("display");
    setText(rotator, first);
  };
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
export function velocitySkew(root: HTMLElement): Teardown | void {
  if (gentleMotion()) return;
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
  return () => {
    gsap.killTweensOf(proxy);
    gsap.set(titles, { clearProps: "transform" });
  };
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

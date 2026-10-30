import { springTo } from "@/motion/spring";
import { gsap } from "@/motion/gsapPlus";
import { keepChildren, listen, setText, type Teardown } from "./types";

const inView = (trigger: Element) => ({ trigger, start: "top 85%", once: true });

/** Small looping or one-shot demos in the feature tiles (spec 18.3 p.07). */
export function bento(root: HTMLElement): Teardown {
  const stops: Teardown[] = [];

  const format = root.querySelector<HTMLElement>("[data-format-cycle]");
  const formats = format?.dataset.formatCycle?.split("|") ?? [];
  if (format && formats.length > 1) {
    const restore = keepChildren(format);
    const timeline = gsap.timeline({
      repeat: -1,
      scrollTrigger: { trigger: format, toggleActions: "play pause resume pause" },
    });
    formats.forEach((_, i) => {
      timeline.to(format, {
        delay: 1.6,
        duration: 0.5,
        scrambleText: {
          text: formats[(i + 1) % formats.length]!,
          chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
          speed: 0.6,
        },
      });
    });
    stops.push(() => {
      gsap.killTweensOf(format);
      restore();
    });
  }

  for (const check of root.querySelectorAll("[data-check]")) {
    gsap.from(check, { drawSVG: 0, duration: 0.8, ease: "vlo", scrollTrigger: inView(check) });
  }

  for (const ring of root.querySelectorAll("[data-timer-ring]")) {
    gsap.fromTo(
      ring,
      { strokeDashoffset: 100.5 },
      {
        strokeDashoffset: 0,
        duration: 6,
        ease: "none",
        repeat: -1,
        scrollTrigger: { trigger: ring, toggleActions: "play pause resume pause" },
      },
    );
  }

  const swatches = root.querySelectorAll("[data-theme-flip] > *");
  if (swatches.length > 0) {
    gsap.from(swatches, {
      rotationY: 180,
      opacity: 0,
      duration: 0.6,
      ease: "vlo",
      stagger: 0.08,
      scrollTrigger: inView(swatches[0]!),
    });
  }

  const mosaic = root.querySelector("[data-mosaic]");
  if (mosaic) {
    gsap.from(mosaic.children, {
      scale: 0,
      duration: 0.4,
      ease: "back.out(2)",
      stagger: { each: 0.015, from: "random" },
      scrollTrigger: inView(mosaic),
    });
  }

  for (const price of root.querySelectorAll<HTMLElement>("[data-count-to]")) {
    const final = price.textContent ?? "";
    const counter = { value: 120 };
    gsap.to(counter, {
      value: Number(price.dataset.countTo ?? 0),
      duration: 1.4,
      ease: "power3.out",
      scrollTrigger: inView(price),
      onUpdate: () => {
        setText(price, `$${Math.round(counter.value)}`);
      },
    });
    stops.push(() => setText(price, final));
  }

  return () => stops.forEach((stop) => stop());
}

/**
 * An AI card grows into its dialog on a spring (spec 18.3 p.06, ADR 0012). The native dialog
 * keeps focus and Escape.
 */
export function cardToDialog(root: HTMLElement): Teardown | void {
  const dialog = root.querySelector<HTMLDialogElement>("#ai dialog");
  if (!dialog) return;
  let running: { cancel: () => void } | null = null;
  const stop = listen(root, "click", (event) => {
    const card = (event.target as Element | null)?.closest<HTMLElement>("#ai [data-tilt]");
    if (!card) return;
    const from = card.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (!dialog.open) return;
      const to = dialog.getBoundingClientRect();
      const x = from.left + from.width / 2 - (to.left + to.width / 2);
      const y = from.top + from.height / 2 - (to.top + to.height / 2);
      const scale = `${from.width / to.width} ${from.height / to.height}`;
      running?.cancel();
      running = springTo(dialog, {
        translate: [`${x}px ${y}px`, "0 0"],
        scale: [scale, "1 1"],
        opacity: [0.4, 1],
      });
    });
  });
  return () => {
    stop();
    running?.cancel();
  };
}

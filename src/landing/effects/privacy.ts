import { gsap } from "@/motion/gsap";
import { finePointer, listen, type Teardown } from "./types";

/**
 * Privacy page (spec 18.3 p.05). The mode badge morphs between icons, the "0" requests digit
 * rolls in on enter and on every mode change (it stays 0: no mode sends text to Vlo), and the
 * hidden line shows through a flashlight that widens with scroll until it is fully lit.
 */
export function privacy(root: HTMLElement): Teardown | void {
  const section = root.querySelector<HTMLElement>("#privacy");
  if (!section) return;
  const stops: Teardown[] = [];

  const digit = section.querySelector<HTMLElement>("[data-odometer] > span");
  const roll = () => {
    if (digit) gsap.fromTo(digit, { yPercent: 100 }, { yPercent: 0, duration: 0.6, ease: "vlo" });
  };
  if (digit) {
    gsap.from(digit, {
      yPercent: 100,
      duration: 0.8,
      ease: "vlo",
      scrollTrigger: { trigger: digit, start: "top 85%" },
    });
  }

  const icon = section.querySelector<SVGPathElement>("[data-mode-icon]");
  const modeSwitch = section.querySelector<HTMLElement>("[data-mode-switch]");
  if (icon && modeSwitch) {
    // `shown` is the path on screen. React writes its own `d` at any time, and a running
    // morph rewrites `d` every frame, so neither the DOM nor React says what the eye sees.
    let shown = icon.getAttribute("d") ?? "";
    let last = shown;
    let frame = 0;
    stops.push(
      listen(modeSwitch, "change", (event) => {
        const next = (event.target as HTMLElement).dataset.icon;
        if (!next || next === last) return;
        last = next;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          gsap.fromTo(
            icon,
            { morphSVG: shown },
            {
              morphSVG: next,
              duration: 0.6,
              ease: "vlo",
              overwrite: true,
              onUpdate: () => (shown = icon.getAttribute("d") ?? shown),
              onComplete: () => (shown = next),
            },
          );
          roll();
        });
      }),
      () => {
        cancelAnimationFrame(frame);
        gsap.killTweensOf(icon);
        // MorphSVG leaves its own path string; put back the one React rendered.
        icon.setAttribute("d", last);
      },
    );
  }

  const light = section.querySelector<HTMLElement>("[data-flashlight]");
  if (light) {
    const mask =
      "radial-gradient(circle var(--light-r) at var(--light-x) var(--light-y), #000 65%, transparent 100%)";
    light.style.setProperty("--light-x", "20%");
    light.style.setProperty("--light-y", "50%");
    light.style.setProperty("mask-image", mask);
    light.style.setProperty("-webkit-mask-image", mask);
    gsap.fromTo(
      light,
      { "--light-r": "3rem" },
      {
        "--light-r": () => `${light.offsetWidth * 1.3}px`,
        ease: "none",
        scrollTrigger: {
          trigger: light,
          start: "top 85%",
          end: "top 35%",
          scrub: true,
          invalidateOnRefresh: true,
        },
      },
    );
    if (finePointer()) {
      stops.push(
        listen(section, "pointermove", (event) => {
          const box = light.getBoundingClientRect();
          gsap.to(light, {
            "--light-x": `${event.clientX - box.left}px`,
            "--light-y": `${event.clientY - box.top}px`,
            duration: 0.4,
            ease: "power3",
            overwrite: "auto",
          });
        }),
      );
    }
    stops.push(() => {
      gsap.killTweensOf(light);
      for (const name of [
        "--light-x",
        "--light-y",
        "--light-r",
        "mask-image",
        "-webkit-mask-image",
      ]) {
        light.style.removeProperty(name);
      }
    });
  }

  return () => {
    stops.forEach((stop) => stop());
    if (digit) {
      gsap.killTweensOf(digit);
      gsap.set(digit, { clearProps: "transform" });
    }
  };
}

import { gsap } from "@/motion/gsap";
import { finePointer, gentleMotion, keepChildren, listen, type Teardown } from "./types";

const LABELS: [selector: string, label: string][] = [
  ["[data-drag-card]", "Drag"],
  ["[data-tilt]", "Open"],
  ["[data-hold]", "Hold"],
];

/** Dot and lagging ring with context labels, on fine pointers only (spec 18.1 item 5). */
export function cursor(): Teardown | void {
  if (!finePointer()) return;
  const layer = document.createElement("div");
  layer.dataset.cursor = "";
  layer.setAttribute("aria-hidden", "true");
  layer.className = "pointer-events-none fixed inset-0 z-50 mix-blend-difference";
  layer.innerHTML = `
    <div data-cursor-ring class="absolute top-0 left-0 -mt-5 -ml-5 grid size-10 place-items-center rounded-full border border-fg font-mono text-[10px] tracking-widest text-fg uppercase opacity-0"></div>
    <div data-cursor-dot class="absolute top-0 left-0 -mt-1 -ml-1 size-2 rounded-full bg-fg opacity-0"></div>`;
  document.body.append(layer);

  const ring = layer.querySelector<HTMLElement>("[data-cursor-ring]")!;
  const dot = layer.querySelector<HTMLElement>("[data-cursor-dot]")!;
  const dotX = gsap.quickTo(dot, "x", { duration: 0.08 });
  const dotY = gsap.quickTo(dot, "y", { duration: 0.08 });
  const ringX = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3" });
  const ringY = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3" });
  let label = "";
  let visible = false;

  const stopMove = listen(window, "pointermove", (event) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    if (!visible) {
      // Hide the native cursor only once the custom one follows a real pointer.
      visible = true;
      document.documentElement.classList.add("has-custom-cursor");
      gsap.set([dot, ring], { opacity: 1 });
    }
    dotX(event.clientX);
    dotY(event.clientY);
    ringX(event.clientX);
    ringY(event.clientY);
    const target = event.target as Element | null;
    const next = LABELS.find(([selector]) => target?.closest(selector))?.[1] ?? "";
    if (next !== label) {
      label = next;
      ring.textContent = label;
      gsap.to(ring, { scale: label ? 2 : 1, duration: 0.3, ease: "vlo" });
    }
  });
  const stopLeave = listen(document, "pointerleave", () => {
    visible = false;
    document.documentElement.classList.remove("has-custom-cursor");
    gsap.set([dot, ring], { opacity: 0 });
  });

  return () => {
    stopMove();
    stopLeave();
    gsap.killTweensOf([dot, ring]);
    layer.remove();
    document.documentElement.classList.remove("has-custom-cursor");
  };
}

/** Magnetic buttons with a duplicated-text roll and a 0.97 press scale (spec 18.1 item 6). */
export function magnetic(root: HTMLElement): Teardown {
  const stops: Teardown[] = [];
  for (const button of root.querySelectorAll<HTMLElement>("[data-magnetic]")) {
    let roll: gsap.core.Tween | undefined;
    if (button.hasAttribute("data-roll")) {
      const restore = keepChildren(button);
      const text = button.textContent ?? "";
      const label = document.createElement("span");
      label.className = "relative block overflow-hidden";
      label.innerHTML = `<span class="block"></span><span aria-hidden="true" class="absolute top-full left-0 block"></span>`;
      label.querySelectorAll("span").forEach((part) => (part.textContent = text));
      button.replaceChildren(label);
      roll = gsap.to(label.children, { yPercent: -100, duration: 0.45, ease: "vlo", paused: true });
      stops.push(restore);
    }
    if (finePointer()) {
      // A soft fill grows from the point where the pointer enters and leaves.
      const fill = document.createElement("span");
      fill.setAttribute("aria-hidden", "true");
      fill.dataset.magneticFill = "";
      const position = button.style.position;
      if (getComputedStyle(button).position === "static") button.style.position = "relative";
      button.style.overflow = "hidden";
      button.append(fill);
      const at = (event: PointerEvent) => {
        const box = button.getBoundingClientRect();
        const size = Math.hypot(box.width, box.height) * 2;
        gsap.set(fill, {
          left: event.clientX - box.left - size / 2,
          top: event.clientY - box.top - size / 2,
          width: size,
          height: size,
        });
      };
      stops.push(
        listen(button, "pointerenter", (event) => {
          at(event);
          gsap.fromTo(fill, { scale: 0 }, { scale: 1, duration: 0.5, ease: "vlo" });
        }),
        listen(button, "pointerleave", (event) => {
          at(event);
          gsap.to(fill, { scale: 0, duration: 0.4, ease: "vlo" });
        }),
        () => {
          gsap.killTweensOf(fill);
          fill.remove();
          button.style.position = position;
          button.style.removeProperty("overflow");
        },
      );
      const x = gsap.quickTo(button, "x", { duration: 0.4, ease: "power3" });
      const y = gsap.quickTo(button, "y", { duration: 0.4, ease: "power3" });
      stops.push(
        listen(button, "pointermove", (event) => {
          const box = button.getBoundingClientRect();
          x((event.clientX - box.left - box.width / 2) * 0.3);
          y((event.clientY - box.top - box.height / 2) * 0.3);
        }),
      );
    }
    stops.push(
      listen(button, "pointerenter", () => roll?.play()),
      listen(button, "pointerleave", () => {
        roll?.reverse();
        gsap.to(button, { x: 0, y: 0, scale: 1, duration: 0.6, ease: "elastic.out(1, 0.4)" });
      }),
      listen(button, "pointerdown", () => gsap.to(button, { scale: 0.97, duration: 0.12 })),
      listen(button, "pointerup", () => gsap.to(button, { scale: 1, duration: 0.3, ease: "vlo" })),
      () => {
        gsap.killTweensOf(button);
        gsap.set(button, { clearProps: "transform" });
      },
    );
  }
  return () => stops.forEach((stop) => stop());
}

/** Key words in the Manifesto grow heavier as the pointer comes near (Fraunces wght axis). */
export function keyWeight(root: HTMLElement): Teardown | void {
  if (!finePointer()) return;
  const words = Array.from(root.querySelectorAll<HTMLElement>("[data-key-word]"));
  if (words.length === 0) return;
  let frame = 0;
  let pointer = { x: -1e4, y: -1e4 };
  const update = () => {
    frame = 0;
    for (const word of words) {
      const box = word.getBoundingClientRect();
      const distance = Math.hypot(
        pointer.x - (box.left + box.width / 2),
        pointer.y - (box.top + box.height / 2),
      );
      const near = Math.max(0, 1 - distance / 260);
      word.style.fontWeight = String(Math.round(300 + near * 500));
    }
  };
  const stop = listen(window, "pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    frame ||= requestAnimationFrame(update);
  });
  return () => {
    stop();
    cancelAnimationFrame(frame);
    for (const word of words) word.style.removeProperty("font-weight");
  };
}

/** AI cards lean toward the pointer (spec 18.3 p.06). */
export function tilt(root: HTMLElement): Teardown | void {
  if (!finePointer() || gentleMotion()) return;
  const stops: Teardown[] = [];
  for (const card of root.querySelectorAll<HTMLElement>("[data-tilt]")) {
    gsap.set(card, { transformPerspective: 800 });
    const rx = gsap.quickTo(card, "rotationX", { duration: 0.5, ease: "power3" });
    const ry = gsap.quickTo(card, "rotationY", { duration: 0.5, ease: "power3" });
    stops.push(
      listen(card, "pointermove", (event) => {
        const box = card.getBoundingClientRect();
        ry(((event.clientX - box.left) / box.width - 0.5) * 10);
        rx(((event.clientY - box.top) / box.height - 0.5) * -10);
      }),
      listen(card, "pointerleave", () => {
        rx(0);
        ry(0);
      }),
      () => {
        gsap.killTweensOf(card);
        gsap.set(card, { clearProps: "transform" });
      },
    );
  }
  return () => stops.forEach((stop) => stop());
}

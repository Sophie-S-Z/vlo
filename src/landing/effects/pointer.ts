import { gsap } from "@/motion/gsap";
import { finePointer, listen, type Teardown } from "./types";

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
  document.documentElement.classList.add("has-custom-cursor");

  const ring = layer.querySelector<HTMLElement>("[data-cursor-ring]")!;
  const dot = layer.querySelector<HTMLElement>("[data-cursor-dot]")!;
  const dotX = gsap.quickTo(dot, "x", { duration: 0.08 });
  const dotY = gsap.quickTo(dot, "y", { duration: 0.08 });
  const ringX = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3" });
  const ringY = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3" });
  let label = "";

  const stopMove = listen(window, "pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    gsap.set([dot, ring], { opacity: 1 });
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
  const stopLeave = listen(document, "pointerleave", () => gsap.set([dot, ring], { opacity: 0 }));

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
      const original = button.innerHTML;
      const text = button.textContent ?? "";
      const label = document.createElement("span");
      label.className = "relative block overflow-hidden";
      label.innerHTML = `<span class="block"></span><span aria-hidden="true" class="absolute top-full left-0 block"></span>`;
      label.querySelectorAll("span").forEach((part) => (part.textContent = text));
      button.replaceChildren(label);
      roll = gsap.to(label.children, { yPercent: -100, duration: 0.45, ease: "vlo", paused: true });
      stops.push(() => {
        button.innerHTML = original;
      });
    }
    if (finePointer()) {
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
    );
  }
  return () => stops.forEach((stop) => stop());
}

/** AI cards lean toward the pointer (spec 18.3 p.06). */
export function tilt(root: HTMLElement): Teardown | void {
  if (!finePointer()) return;
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
    );
  }
  return () => stops.forEach((stop) => stop());
}

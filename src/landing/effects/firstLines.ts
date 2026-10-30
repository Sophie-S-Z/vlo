import { ScrollTrigger } from "@/motion/gsap";
import { Draggable, gsap } from "@/motion/gsapPlus";
import { glideTo } from "./lenis";
import { finePointer, listen, type Teardown } from "./types";

const GAP = 16;
const DRIFT_PX = 0.25;

/**
 * First lines (spec 18.3 p.08). The list becomes an endless, wrapping grid that drags with
 * inertia and drifts slowly. A blank card zooms to full screen and glides to the waitlist.
 * Without effects the static grid and plain #waitlist links stay.
 */
export function firstLines(root: HTMLElement): Teardown | void {
  const list = root.querySelector<HTMLElement>("[data-first-lines]");
  if (!list) return;
  const originals = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-line-card]"));
  if (originals.length === 0) return;
  list.dataset.canvas = "on";

  let cells: HTMLElement[] = [...originals];
  let cols = 0;
  let cellW = 0;
  let cellH = 0;
  let worldW = 0;
  let worldH = 0;
  let wrapX = (v: number) => v;
  let wrapY = (v: number) => v;
  const pan = { x: 0, y: 0 };
  let drift = 0;
  let holding = false;
  let visible = false;
  const proxy = document.createElement("div");
  let zoom: gsap.core.Timeline | undefined;

  const layout = () => {
    const card = originals[0]!;
    cellW = card.offsetWidth + GAP;
    cellH = card.offsetHeight + GAP;
    const viewW = list.clientWidth;
    const viewH = list.clientHeight;
    cols = Math.max(5, Math.ceil((viewW + cellW) / cellW));
    const rows = Math.max(
      3,
      Math.ceil((viewH + cellH) / cellH),
      Math.ceil(originals.length / cols),
    );
    const total = cols * rows;
    // Clones fill wide screens; they are hidden from assistive tech and cannot take focus.
    for (const clone of cells.slice(originals.length)) clone.remove();
    cells = [...originals];
    for (let k = originals.length; k < total; k++) {
      const clone = originals[k % originals.length]!.cloneNode(true) as HTMLElement;
      clone.dataset.clone = "";
      clone.setAttribute("aria-hidden", "true");
      clone.inert = true;
      list.append(clone);
      cells.push(clone);
    }
    worldW = cols * cellW;
    worldH = rows * cellH;
    wrapX = gsap.utils.wrap(-cellW, worldW - cellW);
    wrapY = gsap.utils.wrap(-cellH, worldH - cellH);
    render();
  };
  const render = () => {
    const ox = Number(gsap.getProperty(proxy, "x")) + pan.x + drift;
    const oy = Number(gsap.getProperty(proxy, "y")) + pan.y;
    cells.forEach((cell, k) => {
      const x = wrapX((k % cols) * cellW + ox);
      const y = wrapY(Math.floor(k / cols) * cellH + oy);
      cell.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
  };

  const [draggable] = Draggable.create(proxy, {
    trigger: list,
    type: finePointer() ? "x,y" : "x",
    inertia: true,
    onPress: () => (holding = true),
    onRelease: () => (holding = false),
    onDrag: render,
    onThrowUpdate: render,
  });
  const tick = () => {
    if (!visible || holding || draggable?.tween?.isActive()) return;
    drift -= DRIFT_PX;
    render();
  };
  gsap.ticker.add(tick);
  const watch = new IntersectionObserver(([entry]) => (visible = entry?.isIntersecting ?? false));
  watch.observe(list);
  layout();

  const stops: Teardown[] = [
    listen(window, "resize", layout),
    listen(list, "pointerenter", () => (holding = true)),
    listen(list, "pointerleave", () => (holding = false)),
    // Keyboard focus on a card pans the grid so the card sits in the middle.
    listen(list, "focusin", (event) => {
      const card = (event.target as Element).closest("[data-line-card]");
      if (!card) return;
      const box = list.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      gsap.to(pan, {
        x: pan.x + box.left + box.width / 2 - (r.left + r.width / 2),
        y: pan.y + box.top + box.height / 2 - (r.top + r.height / 2),
        duration: 0.5,
        ease: "vlo",
        onUpdate: render,
      });
    }),
    listen(list, "click", (event) => {
      const blank = (event.target as Element).closest<HTMLAnchorElement>("[data-blank-card]");
      if (!blank) return;
      event.preventDefault();
      zoom?.kill();
      zoom = zoomToWaitlist(root, list, blank);
    }),
  ];

  // Marquee rows speed up with scroll and slow down under the pointer.
  const rows = Array.from(root.querySelectorAll<HTMLElement>("#first-lines [data-marquee]"));
  // The marquee tweens start after this effect, so they are looked up on each tick.
  const marqueeTweens = () => rows.flatMap((row) => gsap.getTweensOf(row));
  let boost = 0;
  let slow = false;
  const speed = ScrollTrigger.create({
    trigger: list.closest("section") ?? list,
    onUpdate: (self) => (boost = Math.min(3, Math.abs(self.getVelocity()) / 600)),
  });
  const marqueeTick = () => {
    boost *= 0.94;
    const target = slow ? 0.25 : 1 + boost;
    for (const tween of marqueeTweens()) {
      tween.timeScale(tween.timeScale() + (target - tween.timeScale()) * 0.1);
    }
  };
  gsap.ticker.add(marqueeTick);
  const marqueeBox = rows[0]?.parentElement?.parentElement;
  if (marqueeBox) {
    stops.push(
      listen(marqueeBox, "pointerenter", () => (slow = true)),
      listen(marqueeBox, "pointerleave", () => (slow = false)),
    );
  }

  return () => {
    stops.forEach((stop) => stop());
    gsap.ticker.remove(tick);
    gsap.ticker.remove(marqueeTick);
    speed.kill();
    for (const tween of marqueeTweens()) tween.timeScale(1);
    zoom?.kill();
    watch.disconnect();
    draggable?.kill();
    gsap.killTweensOf([proxy, pan]);
    for (const clone of cells.slice(originals.length)) clone.remove();
    for (const card of originals) card.style.removeProperty("transform");
    gsap.set(list, { clearProps: "scale,transformOrigin" });
    delete list.dataset.canvas;
    document.querySelector("[data-zoom-card]")?.remove();
  };
}

/** The blank card grows to full screen, the page jumps to the waitlist under it, then it lifts. */
function zoomToWaitlist(
  root: HTMLElement,
  list: HTMLElement,
  card: HTMLElement,
): gsap.core.Timeline | undefined {
  const waitlist = root.querySelector<HTMLElement>("#waitlist");
  const email = waitlist?.querySelector<HTMLInputElement>('input[type="email"]');
  if (!waitlist) return;
  const r = card.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.dataset.zoomCard = "";
  overlay.setAttribute("aria-hidden", "true");
  overlay.className =
    "fixed z-50 flex items-center justify-center rounded-card border border-accent bg-bg p-6 text-center font-display text-2xl text-accent-text italic";
  overlay.textContent = card.textContent;
  Object.assign(overlay.style, {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  });
  document.body.append(overlay);
  const origin = `${r.left + r.width / 2 - list.getBoundingClientRect().left}px ${
    r.top + r.height / 2 - list.getBoundingClientRect().top
  }px`;
  return gsap
    .timeline({ onComplete: () => overlay.remove() })
    .to(list, { scale: 1.12, transformOrigin: origin, duration: 0.7, ease: "vlo" }, 0)
    .to(
      overlay,
      {
        left: 0,
        top: 0,
        width: "100vw",
        height: "100vh",
        borderRadius: 0,
        duration: 0.7,
        ease: "vlo",
      },
      0,
    )
    .call(() => {
      gsap.set(list, { clearProps: "scale,transformOrigin" });
      glideTo(waitlist, { immediate: true });
      history.replaceState(null, "", "#waitlist");
      email?.focus({ preventScroll: true });
    })
    .to(overlay, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.7, ease: "vlo" }, "+=0.1");
}

import { gsap } from "@/motion/gsap";
import { finePointer, gentleMotion, listen, type Teardown } from "./types";

/**
 * Pages that turn as they arrive (ADR 0012). The hero opens the book, and the pinned book and
 * forms pages have their own motion, so they do not turn.
 */
const TURNING = ["02", "05", "06", "07", "08", "09", "10"];

/**
 * Page-turn wipes (ADR 0012). As a page arrives, a sheet in the surface color covers it and
 * turns away from its left edge, like a page in a book. Transform only, scrubbed with scroll.
 * Gentle mode and Calm keep the pages still.
 */
export function pageTurns(root: HTMLElement): Teardown | void {
  if (gentleMotion()) return;
  const pages: [HTMLElement, HTMLElement][] = [];
  for (const n of TURNING) {
    const page = root.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (!page) continue;
    const sheet = document.createElement("div");
    sheet.dataset.turn = "";
    sheet.setAttribute("aria-hidden", "true");
    pages.push([page, sheet]);
  }
  // All writes first, then all reads, so the page lays out once.
  for (const [page, sheet] of pages) page.prepend(sheet);
  const sheets = pages.map(([, sheet]) => sheet);
  for (const sheet of sheets) gsap.getProperty(sheet, "x");
  for (const [page, sheet] of pages) {
    gsap.fromTo(
      sheet,
      { rotationY: 0, transformPerspective: 2000, transformOrigin: "0% 50%" },
      {
        rotationY: -92,
        ease: "power2.in",
        scrollTrigger: {
          trigger: page,
          start: "top 95%",
          end: "top 40%",
          scrub: 0.4,
          // A finished sheet leaves the layout tree, so it costs nothing while the page is read.
          onLeave: () => (sheet.style.visibility = "hidden"),
          onEnterBack: () => sheet.style.removeProperty("visibility"),
        },
      },
    );
  }
  return () => {
    for (const sheet of sheets) sheet.remove();
  };
}

/** How long a point of the ink trail lives, in milliseconds. */
const TRAIL_MS = 420;

/**
 * A short ink trail behind a fine pointer (ADR 0012). A small 2D canvas draws the last few
 * hundred milliseconds of the path in the accent color. The loop sleeps when the pointer rests.
 * Gentle mode, Calm and touch screens get no trail.
 */
export function inkTrail(): Teardown | void {
  if (!finePointer() || gentleMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.dataset.inkTrail = "";
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "pointer-events-none fixed inset-0 z-40";
  document.body.append(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  const points: { x: number; y: number; t: number }[] = [];
  let frame = 0;
  let color = "#e0664b";
  const size = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  size();

  const draw = () => {
    const now = performance.now();
    while (points.length > 0 && now - points[0]!.t > TRAIL_MS) points.shift();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.strokeStyle = color;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const life = 1 - (now - b.t) / TRAIL_MS;
      context.globalAlpha = life * 0.55;
      context.lineWidth = 0.5 + life * 3.5;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    frame = points.length > 0 ? requestAnimationFrame(draw) : 0;
  };

  const stops = [
    listen(
      window,
      "pointermove",
      (event) => {
        if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
        if (points.length === 0) {
          color =
            getComputedStyle(document.documentElement).getPropertyValue("--vlo-accent").trim() ||
            color;
        }
        points.push({ x: event.clientX, y: event.clientY, t: performance.now() });
        if (!frame) frame = requestAnimationFrame(draw);
      },
      { passive: true },
    ),
    listen(window, "resize", size),
  ];
  return () => {
    stops.forEach((stop) => stop());
    cancelAnimationFrame(frame);
    canvas.remove();
  };
}

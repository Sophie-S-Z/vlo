import { gsap } from "@/motion/gsap";
import type { Frame } from "@/gl/field";
import type { Anchor } from "@/gl/progress";
import { readStorage } from "@/ui/lib/storage";
import { finePointer, listen, type Teardown } from "./types";

/** Frame-rate guard: a slow average over this many frames switches the field off. */
const GUARD_FRAMES = 90;
const GUARD_MAX_MS = 45;

/** Which page shows which shape (spec 18.2 order). Pages in between hold the last shape. */
const PAGE_SHAPES: [selector: string, value: number][] = [
  ['[data-page="01"]', 0],
  ['[data-page="02"]', 1],
  ['[data-page="03"]', 2],
  ['[data-page="04"]', 3],
  ['[data-page="05"]', 4],
  ['[data-page="09"]', 4],
  ['[data-page="10"]', 5],
  ["footer", 6],
];

/** The still art each shape replaces; the particles gather where that art sits. */
const SHAPE_ART: Partial<Record<number, string>> = {
  2: '[data-still-art="book"]',
  4: '[data-still-art="lock"]',
  5: '[data-still-art="plane"]',
};

function frameFor(root: HTMLElement, progress: number): Frame {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const shape = Math.round(progress);
  const art = SHAPE_ART[shape];
  const element = art ? root.querySelector(art) : null;
  if (element) {
    const box = element.getBoundingClientRect();
    // Art that is off screen does not pull the shape away; the shape waits in the middle.
    if (box.width > 0 && box.bottom > 0 && box.top < height) {
      return {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
        size: Math.max(box.width, box.height) * 1.1,
      };
    }
  }
  // The wordmark sits right of the hero headline on wide screens.
  if (shape === 0 && width >= 1024) return { x: width * 0.72, y: height * 0.5, size: width * 0.42 };
  return { x: width / 2, y: height / 2, size: Math.min(width, height) * 0.85 };
}

/** Test switch: e2e tests turn the field on for a software renderer. */
export const FIELD_FORCE_KEY = "vlo:field-force";

/**
 * True when WebGL 2 runs on a GPU. A software renderer (SwiftShader, llvmpipe) would block
 * the main thread for seconds per frame, so the still art stays instead.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    const software = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
    return !software || readStorage(FIELD_FORCE_KEY) === "1";
  } catch {
    return false;
  }
}

function readAnchors(root: HTMLElement): Anchor[] {
  const anchors: Anchor[] = [];
  for (const [selector, value] of PAGE_SHAPES) {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) continue;
    const top = element.getBoundingClientRect().top + window.scrollY;
    // The last anchors must stay reachable: the middle of the screen stops at maxMiddle.
    const maxMiddle = document.documentElement.scrollHeight - window.innerHeight / 2;
    const at = top + Math.min(element.offsetHeight, window.innerHeight) * 0.3;
    anchors.push({ top: Math.min(at, maxMiddle - (PAGE_SHAPES.length - anchors.length)), value });
  }
  return anchors.sort((a, b) => a.top - b.top);
}

function themeColors(): [string, string] {
  const style = getComputedStyle(document.documentElement);
  return [
    style.getPropertyValue("--vlo-text").trim() || "#888",
    style.getPropertyValue("--vlo-accent").trim() || "#c44",
  ];
}

/**
 * The persistent WebGL canvas behind the HTML (spec 18.1 item 7). three.js loads in its own
 * chunk only after the other effects start. With no WebGL or a lost context, the still SVG art
 * stays (spec 18.2).
 */
export function field(root: HTMLElement): Teardown | void {
  if (!webglAvailable()) return;
  let stopped = false;
  let stop: Teardown | undefined;

  void import("@/gl/field")
    .then(({ createField }) => {
      if (stopped) return;
      const canvas = document.createElement("canvas");
      canvas.dataset.field = "";
      canvas.setAttribute("aria-hidden", "true");
      canvas.className = "pointer-events-none fixed inset-0 -z-10 size-full";
      const stills = Array.from(root.querySelectorAll<HTMLElement>("[data-still-art]"));
      const stops: Teardown[] = [];
      const teardown = () => {
        stops.forEach((s) => s());
        stops.length = 0;
        instance?.dispose();
        instance = undefined;
        canvas.remove();
        for (const still of stills) still.style.removeProperty("visibility");
      };

      let instance: ReturnType<typeof createField> | undefined;
      try {
        root.prepend(canvas);
        instance = createField(canvas, {
          count: matchMedia("(max-width: 640px), (pointer: coarse)").matches ? 3000 : 12000,
          ink: finePointer() && window.innerWidth >= 1024,
          anchors: () => readAnchors(root),
          onLost: teardown,
        });
      } catch (error) {
        teardown();
        console.warn("The particle field did not start.", error);
        return;
      }
      const field = instance;
      for (const still of stills) still.style.visibility = "hidden";

      const applyColors = () => field.setColors(...themeColors());
      applyColors();
      const themeWatch = new MutationObserver(applyColors);
      themeWatch.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      const forced = readStorage(FIELD_FORCE_KEY) === "1";
      let frames = 0;
      let since = performance.now();
      const tick = (time: number) => {
        if (!instance) return;
        instance.render(time, frameFor(root, instance.progress()));
        if (forced || ++frames < GUARD_FRAMES) return;
        // A device that cannot hold about 22 fps gets the still art back.
        const average = (performance.now() - since) / GUARD_FRAMES;
        frames = 0;
        since = performance.now();
        if (average > GUARD_MAX_MS && !document.hidden) teardown();
      };
      gsap.ticker.add(tick);
      const stopResize = listen(window, "resize", () => instance?.resize());
      const stopPointer = finePointer()
        ? listen(window, "pointermove", (event) => {
            instance?.pointer(
              (event.clientX / window.innerWidth) * 2 - 1,
              -((event.clientY / window.innerHeight) * 2 - 1),
            );
          })
        : () => {};
      stops.push(
        () => gsap.ticker.remove(tick),
        stopResize,
        stopPointer,
        () => themeWatch.disconnect(),
      );
      stop = teardown;
    })
    .catch((error: unknown) => {
      console.warn("The particle field did not load.", error);
    });

  return () => {
    stopped = true;
    stop?.();
  };
}

import { Draggable, Flip, gsap } from "@/motion/gsap";
import { listen, type Teardown } from "./types";

const WIDE = "(min-width: 1024px)";

/**
 * The Three forms track (spec 18.3 p.04). On wide screens the panels sit in one row and the
 * section pins while the row moves left; phones keep the vertical stack (spec 18.1 item 11).
 * `onTrack` receives the row tween, so panel effects can use it as their containerAnimation.
 */
export function formsTrack(
  root: HTMLElement,
  onTrack: (track: gsap.core.Tween | null) => void = () => {},
): Teardown | void {
  const section = root.querySelector<HTMLElement>("#forms");
  const track = section?.querySelector<HTMLElement>("[data-forms-track]");
  if (!section || !track) return;
  const mm = gsap.matchMedia();
  mm.add({ wide: WIDE, narrow: `not all and ${WIDE}` }, (context) => {
    if (!context.conditions?.wide) {
      onTrack(null);
      return;
    }
    track.dataset.track = "row";
    // The row ends with its last panel at the same inset the first one started with.
    const distance = () => track.scrollWidth - (section.clientWidth - track.offsetLeft * 2);
    const tween = gsap.to(track, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: {
        trigger: section,
        // The pin holds the panels near the top of the screen; the heading scrolls away above.
        start: () => `top+=${track.offsetTop - 80} top`,
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
      },
    });
    onTrack(tween);
    return () => {
      delete track.dataset.track;
      onTrack(null);
    };
  });
  return () => mm.revert();
}

/**
 * Novel panel (spec 18.3 p.04): scene cards drag and throw with inertia in Board layout, the
 * threads between them follow, and the Grid/Board switch (React state) animates with Flip.
 */
export function novelBoard(root: HTMLElement): Teardown | void {
  const board = root.querySelector<HTMLElement>("[data-novel-board]");
  const list = board?.querySelector<HTMLElement>("[data-novel-cards]");
  if (!board || !list) return;
  const cards = Array.from(list.querySelectorAll<HTMLElement>("[data-drag-card]"));
  const saved = new Map<Element, [string, string | null][]>();
  const THREAD_ATTRS = ["x1", "y1", "x2", "y2"];

  // The effect owns the thread coordinates in pixels, so DrawSVG measures true lengths.
  const threads = () => {
    const svg = board.querySelector("svg");
    const lines = Array.from(board.querySelectorAll<SVGLineElement>("[data-thread]"));
    for (const element of svg ? [svg, ...lines] : []) {
      if (saved.has(element)) continue;
      const names = element === svg ? ["viewBox", "preserveAspectRatio"] : THREAD_ATTRS;
      saved.set(
        element,
        names.map((name) => [name, element.getAttribute(name)]),
      );
    }
    return { svg, lines };
  };
  const updateThreads = () => {
    const { svg, lines } = threads();
    if (!svg) return;
    const box = board.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
    const centers = cards.map((card) => {
      const r = card.getBoundingClientRect();
      return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top] as const;
    });
    lines.forEach((line, i) => {
      const a = centers[i];
      const b = centers[i + 1];
      if (!a || !b) return;
      line.setAttribute("x1", a[0].toFixed(1));
      line.setAttribute("y1", a[1].toFixed(1));
      line.setAttribute("x2", b[0].toFixed(1));
      line.setAttribute("y2", b[1].toFixed(1));
    });
  };
  const drawThreads = () => {
    const { lines } = threads();
    if (lines.length === 0) return;
    gsap.fromTo(
      lines,
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 0.8, ease: "vlo", stagger: 0.08, delay: 0.2 },
    );
  };

  const draggables = Draggable.create(cards, {
    bounds: board,
    inertia: true,
    zIndexBoost: true,
    onDrag: updateThreads,
    onThrowUpdate: updateThreads,
  });
  const syncEnabled = () => {
    const on = list.dataset.layout === "board";
    for (const draggable of draggables) {
      if (on) draggable.enable();
      else draggable.disable();
    }
  };
  syncEnabled();
  updateThreads();

  // The click handler reads the layout before React changes it; the observer animates after.
  let state: Flip.FlipState | null = null;
  const stopClick = listen(
    board.parentElement ?? board,
    "click",
    (event) => {
      if ((event.target as Element).closest("[data-layout-toggle]")) state = Flip.getState(cards);
    },
    { capture: true },
  );
  const watch = new MutationObserver(() => {
    gsap.set(cards, { x: 0, y: 0 });
    syncEnabled();
    for (const draggable of draggables) draggable.update();
    updateThreads();
    if (state) {
      Flip.from(state, {
        duration: 0.7,
        ease: "vlo",
        stagger: 0.03,
        absolute: true,
        onComplete: updateThreads,
      });
      state = null;
    }
    drawThreads();
  });
  watch.observe(list, { attributes: true, attributeFilter: ["data-layout"] });
  const stopResize = listen(window, "resize", updateThreads);

  return () => {
    watch.disconnect();
    stopClick();
    stopResize();
    for (const draggable of draggables) draggable.kill();
    gsap.killTweensOf(cards);
    gsap.set(cards, { clearProps: "transform,zIndex" });
    for (const [element, attrs] of saved) {
      gsap.killTweensOf(element);
      gsap.set(element, { clearProps: "strokeDasharray,strokeDashoffset" });
      for (const [name, value] of attrs) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }
  };
}

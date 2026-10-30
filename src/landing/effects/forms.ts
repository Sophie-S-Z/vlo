import { readTilt, tiltOn } from "@/landing/lab/tilt";
import { Draggable, Flip, gsap } from "@/motion/gsapPlus";
import { glideTo } from "./lenis";
import { scrambleText } from "./scramble";
import { listen, setText, type Teardown } from "./types";

const WIDE = "(min-width: 1024px)";

/**
 * The Three forms track (spec 18.3 p.04). On wide screens the panels sit in one row and the
 * section pins while the row moves left; phones keep the vertical stack (spec 18.1 item 11).
 * Panel reveals start inside the same media context, so they follow the current layout.
 */
export function formsTrack(root: HTMLElement): Teardown | void {
  const section = root.querySelector<HTMLElement>("#forms");
  const track = section?.querySelector<HTMLElement>("[data-forms-track]");
  if (!section || !track) return;
  const mm = gsap.matchMedia();
  mm.add({ wide: WIDE, narrow: `not all and ${WIDE}` }, (context) => {
    if (!context.conditions?.wide) {
      return panelReveals(section, null);
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
    const stopReveals = panelReveals(section, tween);
    // Keyboard focus in an off-screen panel moves the page to the scroll point that shows it.
    const stopFocus = listen(track, "focusin", (event) => {
      const target = event.target as Element;
      if (!target.matches(":focus-visible")) return; // a mouse click must not move the page
      const panel = target.closest<HTMLElement>("[data-forms-track] > *");
      const st = tween.scrollTrigger;
      if (!panel || !st) return;
      const box = panel.getBoundingClientRect();
      if (box.left >= 0 && box.right <= window.innerWidth) return;
      const progress = Math.min(1, Math.max(0, (panel.offsetLeft - track.offsetLeft) / distance()));
      glideTo(st.start + progress * (st.end - st.start), { immediate: true });
    });
    return () => {
      stopFocus();
      stopReveals();
      delete track.dataset.track;
    };
  });
  return () => mm.revert();
}

/** Scroll reveals inside the panels. In the row they ride the track as containerAnimation. */
function panelReveals(section: HTMLElement, track: gsap.core.Tween | null): Teardown {
  const enter = (trigger: Element): ScrollTrigger.Vars =>
    track
      ? { trigger, containerAnimation: track, start: "left 85%" }
      : { trigger, start: "top 85%" };

  const timeline = section.querySelector("[data-timeline]");
  if (timeline) {
    const reveal = gsap.timeline({ scrollTrigger: enter(timeline) });
    reveal
      .from(timeline.querySelector("[data-timeline-line]"), {
        scaleX: 0,
        duration: 1.2,
        ease: "vlo",
      })
      // Clip instead of fading: the labels keep full contrast at every frame.
      .from(
        timeline.querySelectorAll("[data-stage]"),
        { yPercent: 60, clipPath: "inset(0% 0% 100% 0%)", duration: 0.5, stagger: 0.12 },
        0.2,
      );
  }
  return typePoem(section, enter);
}

/** The poem types itself line by line; indents show at once and counts appear per line. */
function typePoem(section: HTMLElement, enter: (trigger: Element) => ScrollTrigger.Vars): Teardown {
  const poem = section.querySelector("[data-poem]");
  if (!poem) return () => {};
  const lines = Array.from(poem.querySelectorAll<HTMLElement>("[data-poem-line]"));
  const counts = Array.from(poem.querySelectorAll<HTMLElement>("[data-syllables]"));
  const full = lines.map((line) => line.textContent ?? "");
  lines.forEach((line, i) => setText(line, full[i]!.match(/^ */)![0]));
  const typing = gsap.timeline({ scrollTrigger: enter(poem) });
  lines.forEach((line, i) => {
    const text = full[i]!;
    const indent = text.match(/^ */)![0].length;
    const state = { n: 0 };
    typing.to(state, {
      n: text.length - indent,
      duration: (text.length - indent) * 0.035,
      ease: "none",
      onUpdate: () => setText(line, text.slice(0, indent + Math.round(state.n))),
    });
    const count = counts[i];
    if (count?.textContent) {
      typing.from(count, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.2 }, "<+=0.1");
    }
    typing.to({}, { duration: text ? 0.15 : 0.35 });
  });
  return () => lines.forEach((line, i) => setText(line, full[i]!));
}

/** Memoir names scramble between the real name and the alias on hover and on change. */
export function memoirNames(root: HTMLElement): Teardown | void {
  const names = Array.from(root.querySelectorAll<HTMLElement>("[data-alias-name]"));
  if (names.length === 0) return;
  const current = (name: HTMLElement) =>
    name.getAttribute("aria-pressed") === "true" ? name.dataset.alias! : name.dataset.real!;
  const other = (name: HTMLElement) =>
    name.getAttribute("aria-pressed") === "true" ? name.dataset.real! : name.dataset.alias!;
  const visible = new Map(names.map((name) => [name, current(name)]));

  const tweens = new Map<HTMLElement, object>();
  const scramble = (name: HTMLElement, to: string) => {
    const from = visible.get(name) ?? to;
    // Each scramble tweens its own state object, so the previous one for this name must stop.
    const previous = tweens.get(name);
    if (previous) gsap.killTweensOf(previous);
    const state = { progress: 0 };
    gsap.to(state, {
      progress: 1,
      duration: 0.5,
      ease: "none",
      onUpdate: () => {
        const text = scrambleText(from, to, state.progress);
        visible.set(name, text);
        name.dataset.text = text;
      },
    });
    tweens.set(name, state);
  };
  const stops: Teardown[] = [];
  for (const name of names) {
    stops.push(
      listen(name, "pointerenter", (event) => {
        if (event.pointerType === "mouse") scramble(name, other(name));
      }),
      listen(name, "pointerleave", () => scramble(name, current(name))),
      listen(name, "focus", () => scramble(name, current(name))),
    );
  }
  // React flips aria-pressed on click or tap; the visible text then scrambles to the new name.
  const watch = new MutationObserver((records) => {
    for (const record of records) {
      const name = record.target as HTMLElement;
      name.dataset.text = visible.get(name) ?? current(name);
      scramble(name, current(name));
    }
  });
  for (const name of names) {
    watch.observe(name, { attributes: true, attributeFilter: ["aria-pressed"] });
  }
  return () => {
    watch.disconnect();
    stops.forEach((stop) => stop());
    for (const [name, state] of tweens) {
      gsap.killTweensOf(state);
      name.dataset.text = current(name);
    }
  };
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
    for (const element of saved.keys()) if (!element.isConnected) saved.delete(element);
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

  // Draggable measures every card and its bounds when it starts, which blocks the main thread
  // for a long task during page load. The cards become draggable on the first press instead.
  let draggables: Draggable[] = [];
  const syncEnabled = () => {
    const on = list.dataset.layout === "board";
    // Draggable would set this itself; a touch on a card must not start a page pan first.
    for (const card of cards) card.style.touchAction = on ? "none" : "";
    for (const draggable of draggables) {
      if (on) draggable.enable();
      else draggable.disable();
    }
  };
  syncEnabled();
  const stopPress = listen(list, "pointerdown", (event) => {
    if (draggables.length > 0 || list.dataset.layout !== "board") return;
    const card = (event.target as Element | null)?.closest<HTMLElement>("[data-drag-card]");
    if (!card) return;
    draggables = Draggable.create(cards, {
      bounds: board,
      inertia: true,
      zIndexBoost: true,
      onDrag: updateThreads,
      onThrowUpdate: updateThreads,
    });
    syncEnabled();
    draggables[cards.indexOf(card)]?.startDrag(event);
  });
  updateThreads();

  // The click handler reads the layout before React changes it; the observer animates after.
  let state: Flip.FlipState | null = null;
  let flip: gsap.core.Timeline | undefined;
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
      flip = Flip.from(state, {
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
  // The board resizes after media queries apply, unlike a window resize event.
  const sizeWatch = new ResizeObserver(updateThreads);
  sizeWatch.observe(board);

  return () => {
    watch.disconnect();
    sizeWatch.disconnect();
    stopClick();
    stopPress();
    // Finishing the Flip removes its inline position and size before the cleanup below.
    flip?.progress(1).kill();
    for (const draggable of draggables) draggable.kill();
    gsap.killTweensOf(cards);
    gsap.set(cards, { clearProps: "transform,translate,rotate,scale,zIndex" });
    for (const card of cards) {
      for (const name of ["transform", "translate", "rotate", "scale", "z-index", "touch-action"]) {
        card.style.removeProperty(name);
      }
    }
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

/**
 * Magnetic poetry (spec 18.3 p.04). Matter.js loads in its own chunk when the box nears the
 * screen. The physics run only while the box is on screen; scroll speed, or the phone's tilt,
 * tilts gravity a little.
 */
export function magnets(root: HTMLElement): Teardown | void {
  const box = root.querySelector<HTMLElement>("[data-magnets]");
  if (!box || typeof IntersectionObserver !== "function") return;
  let stopped = false;
  let visible = false;
  let world: import("@/landing/physics/magnets").Magnets | undefined;
  let lastScroll = window.scrollY;
  let tilt = 0;
  let requested = false;
  let build: (() => void) | undefined;

  const tick = (_time: number, deltaMs: number) => {
    if (!world || !visible) return;
    const scroll = window.scrollY;
    tilt += ((lastScroll - scroll) * 0.02 - tilt) * 0.1;
    lastScroll = scroll;
    // On a phone with "Enable motion" on, the device tilt leads.
    world.tilt(tiltOn() ? readTilt().x : tilt);
    world.step(deltaMs);
  };
  const load = () => {
    void import("@/landing/physics/magnets")
      .then(({ createMagnets }) => {
        if (stopped) return;
        const tiles = Array.from(box.querySelectorAll<HTMLElement>("[data-magnet]"));
        build = () => {
          world?.dispose();
          world = createMagnets(box, tiles);
        };
        build();
        box.dataset.physics = "on";
        gsap.ticker.add(tick);
      })
      .catch((error: unknown) => console.warn("The word tiles did not load.", error));
  };
  const watch = new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible && !world && !requested) {
        requested = true;
        load();
      }
    },
    { rootMargin: "300px" },
  );
  watch.observe(box);
  // A new box size (a breakpoint, a rotated phone) reflows the tiles, so the world starts again
  // from the new flow positions.
  let width = box.clientWidth;
  const sizeWatch = new ResizeObserver(() => {
    if (box.clientWidth === width) return;
    width = box.clientWidth;
    build?.();
  });
  sizeWatch.observe(box);

  return () => {
    stopped = true;
    watch.disconnect();
    sizeWatch.disconnect();
    gsap.ticker.remove(tick);
    world?.dispose();
    world = undefined;
    delete box.dataset.physics;
  };
}

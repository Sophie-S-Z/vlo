import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "@/test/matchMedia";

// gsap reads matchMedia when its plugins register, so stub it before the import.
mockMatchMedia({ "(pointer: fine)": true });
window.scrollTo = () => {};
const { ScrollTrigger } = await import("gsap/ScrollTrigger");
const { gsap } = await import("gsap");
const { startLandingEffects } = await import("./index");

beforeAll(() => {
  mockMatchMedia({ "(pointer: fine)": true });
});

function mountPage(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <header data-nav><a data-logo href="#top"><svg><path data-logo-path d="M6 7l10 19 10-19"/></svg></a>
      <a data-scramble href="#faq">FAQ</a><a data-magnetic href="#waitlist">Join</a>
      <div data-ink-line></div></header>
    <p data-page-counter>p. <span data-page-current>01</span> / 10</p>
    <section id="top" data-page="01"><h1 data-reveal-lines>Write the book only you can write.</h1>
      <span data-rotate="memoir|novel">memoir</span><svg data-spin></svg></section>
    <section id="manifesto" data-page="02"><h2>Manifesto</h2>
      <p data-scroll-fill><span data-word>One </span><span data-word>two </span></p>
      <p data-fly-in>Closing.</p></section>
    <section id="waitlist" data-page="10"><h2>Join</h2></section>
    <p data-marquee="1">a · b</p><p data-ticker>tagline</p>
    <button data-tilt>Card</button>`;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("startLandingEffects", () => {
  it("creates scroll triggers, smooth scroll and a cursor, then removes all of them", () => {
    const root = mountPage();
    const teardown = startLandingEffects(root);

    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);
    expect(document.documentElement.classList.contains("lenis")).toBe(true);
    expect(document.querySelector("[data-cursor]")).not.toBeNull();

    teardown();

    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(document.documentElement.classList.contains("lenis")).toBe(false);
    expect(document.querySelector("[data-cursor]")).toBeNull();
    expect(root.querySelector("h1")?.textContent).toBe("Write the book only you can write.");
    expect(root.querySelector("h1")?.children).toHaveLength(0);
  });

  it("undoes every started effect when a later step throws", () => {
    const root = mountPage();
    const saved = globalThis.ResizeObserver;
    // @ts-expect-error: simulate a browser without ResizeObserver, so Lenis throws.
    delete globalThis.ResizeObserver;
    try {
      expect(() => startLandingEffects(root)).toThrow();
    } finally {
      globalThis.ResizeObserver = saved;
    }
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(document.querySelector("[data-cursor]")).toBeNull();
    expect(root.querySelector("h1")?.children).toHaveLength(0);
  });

  it("can run twice in a row without leaking", () => {
    const root = mountPage();
    startLandingEffects(root)();
    startLandingEffects(root)();
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  it("starts the effects below the fold in later tasks, and teardown before then cancels them", async () => {
    const root = mountPage();
    const marquee = root.querySelector("[data-marquee]")!;
    const teardown = startLandingEffects(root);
    expect(gsap.getTweensOf(marquee)).toHaveLength(0);
    await vi.waitFor(() => expect(gsap.getTweensOf(marquee).length).toBeGreaterThan(0));
    teardown();
    expect(gsap.getTweensOf(marquee)).toHaveLength(0);

    const again = startLandingEffects(root);
    again();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gsap.getTweensOf(marquee)).toHaveLength(0);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });
});

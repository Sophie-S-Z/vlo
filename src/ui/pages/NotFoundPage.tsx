import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useMotionPreferences } from "@/motion/MotionPreferences";

const HEADING = "This page isn't written yet";
/** Readers see the heading first; then the letters fall. */
const DROP_DELAY_MS = 900;

/**
 * 404 (spec 18.3): the letters of the heading drop under Matter.js, and visitors drag and throw
 * them. Screen readers get the heading as one piece of text. Reduced motion and Calm keep the
 * letters still.
 */
export default function NotFoundPage() {
  const { reduced } = useMotionPreferences();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = box.current;
    if (reduced || !element) return;
    let stopped = false;
    let frame = 0;
    let dispose = () => {};
    const timer = window.setTimeout(() => {
      void Promise.all([import("@/landing/physics/magnets"), document.fonts?.ready])
        .then(([{ createMagnets }]) => {
          if (stopped) return;
          const letters = Array.from(element.querySelectorAll<HTMLElement>("[data-letter]"));
          const world = createMagnets(element, letters);
          element.dataset.physics = "on";
          let last = performance.now();
          const tick = (now: number) => {
            world.step(now - last);
            last = now;
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
          // A narrower window moves the walls in, so no letter is left off screen.
          const sizeWatch = new ResizeObserver(() => world.resize());
          sizeWatch.observe(element);
          dispose = () => {
            sizeWatch.disconnect();
            cancelAnimationFrame(frame);
            world.dispose();
            delete element.dataset.physics;
          };
        })
        .catch(() => {
          // The letters stay where they are; the page still works.
        });
    }, DROP_DELAY_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      dispose();
    };
  }, [reduced]);

  return (
    <section className="space-y-4">
      <title>Page not found · Vlo</title>
      <div ref={box} data-letter-box className="relative h-[60vh] min-h-80">
        <h1 className="font-display text-[clamp(2.5rem,9vw,5.5rem)] leading-[1.2]">
          <span className="sr-only">{HEADING}</span>
          <span aria-hidden="true">
            {HEADING.split(" ").map((word, w) => (
              <span key={w} className="inline-block whitespace-nowrap">
                {Array.from(word).map((letter, i) => (
                  <span key={i} data-letter className="inline-block">
                    {letter}
                  </span>
                ))}
                &nbsp;
              </span>
            ))}
          </span>
        </h1>
      </div>
      <Link to="/" className="text-accent-text underline underline-offset-4">
        Go to the first page
      </Link>
    </section>
  );
}

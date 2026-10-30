import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * The sliding "I write" marker (Lovable merge, ADR 0012). It sits behind the picked option and
 * glides to the next one on the spring token. CSS runs the glide, so no motion library loads
 * with the form. Calm renders no marker; the options keep their plain checked style.
 */
export function WriterMarker({
  value,
  container,
}: {
  value: string | undefined;
  container: RefObject<HTMLElement | null>;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const shown = useRef(false);

  useLayoutEffect(() => {
    const element = marker.current;
    const box = container.current;
    if (!element || !box || !value) return;
    const place = (glide: boolean) => {
      const target = box.querySelector<HTMLElement>(`[data-writer-option="${value}"]`);
      if (!target) return;
      if (!glide) element.style.transition = "none";
      element.style.translate = `${target.offsetLeft}px ${target.offsetTop}px`;
      element.style.width = `${target.offsetWidth}px`;
      element.style.height = `${target.offsetHeight}px`;
      if (!glide) {
        // Apply the jump before the transition comes back.
        void element.offsetWidth;
        element.style.removeProperty("transition");
      }
    };
    // The first pick appears in place; later picks glide.
    place(shown.current);
    shown.current = true;
    if (typeof ResizeObserver !== "function") return;
    // ResizeObserver reports once on observe; that first report must not cut the glide short.
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) first = false;
      else place(false);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [value, container]);

  return (
    <span
      ref={marker}
      data-writer-marker
      data-on={value}
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 rounded-full bg-accent-text opacity-0 data-on:opacity-100"
    />
  );
}

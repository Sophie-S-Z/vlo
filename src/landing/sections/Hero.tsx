import { HERO } from "../copy";
import { HeroArt } from "../art/HeroArt";

export function Hero() {
  return (
    <section
      id="top"
      data-page="01"
      aria-labelledby="hero-title"
      className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden px-4 pt-28 pb-16 sm:px-8"
    >
      <HeroArt />
      <p
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-24 overflow-hidden font-display text-[18vw] leading-none whitespace-nowrap text-fg opacity-[0.06] select-none"
      >
        <span data-word-band>{HERO.words.join(" · ")}</span>
      </p>
      <div className="relative max-w-5xl">
        <p className="mb-6 font-mono text-xs tracking-widest text-muted uppercase">
          Write in flow.
        </p>
        <h1
          id="hero-title"
          data-reveal-lines
          className="font-display text-[clamp(2.75rem,9vw,8rem)] leading-[0.95] font-light tracking-tight text-balance"
        >
          Write the book only you can write.
        </h1>
        <p className="mt-8 font-serif text-xl sm:text-2xl">
          {HERO.rotatingPrefix}{" "}
          <span data-rotate={HERO.rotatingWords.join("|")} className="text-accent-text italic">
            {HERO.rotatingWords[0]}
          </span>
          .
        </p>
        <p className="mt-3 max-w-prose font-serif text-lg text-muted">{HERO.note}</p>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <a
            href="#waitlist"
            data-magnetic
            data-roll
            className="inline-flex min-h-12 items-center rounded-full bg-accent-text px-7 text-base font-medium text-bg"
          >
            {HERO.button}
          </a>
          <Badge />
        </div>
      </div>
    </section>
  );
}

/** Rotating circular "write in flow" badge (spec 18.3 p.01). Decorative. */
function Badge() {
  return (
    <svg data-spin viewBox="0 0 100 100" className="size-24 text-muted" aria-hidden="true">
      <defs>
        <path id="badge-circle" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" />
      </defs>
      <text className="fill-current font-mono text-[9.5px] tracking-[0.2em] uppercase">
        <textPath href="#badge-circle">{HERO.badge}</textPath>
      </text>
      <path
        d="M44 42l6 12 6-12"
        fill="none"
        stroke="var(--vlo-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

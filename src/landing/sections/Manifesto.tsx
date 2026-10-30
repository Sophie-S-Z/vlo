import { MANIFESTO } from "../copy";
import { Eyebrow, Page } from "./Page";

export function Manifesto() {
  const key = new Set<string>(MANIFESTO.keyWords);
  return (
    <Page n={2} id="manifesto" titleId="manifesto-title" className="mx-auto max-w-5xl">
      <Eyebrow n={2}>Manifesto</Eyebrow>
      <h2 id="manifesto-title" className="sr-only">
        {MANIFESTO.title}
      </h2>
      <p
        data-scroll-fill
        className="font-display text-[clamp(1.75rem,4.5vw,3.5rem)] leading-[1.15] font-light"
      >
        {MANIFESTO.body.split(" ").map((word, i) => (
          <span key={i} data-word className={key.has(word) ? "key-word" : undefined}>
            {word}{" "}
          </span>
        ))}
      </p>
      <p
        data-fly-in
        className="mt-20 font-display text-[clamp(2.25rem,7vw,6rem)] leading-none text-accent-text italic"
      >
        {MANIFESTO.closing}
      </p>
    </Page>
  );
}

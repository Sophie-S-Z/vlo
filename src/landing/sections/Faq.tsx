import { FAQ } from "../copy";
import { Eyebrow, Page } from "./Page";

/** Native details elements: works with no JavaScript and with the keyboard. */
export function Faq() {
  return (
    <Page n={9} id="faq" titleId="faq-title" className="mx-auto max-w-4xl">
      <Eyebrow n={9}>Questions</Eyebrow>
      <h2 id="faq-title" className="font-display text-[clamp(2rem,5vw,4rem)] leading-tight">
        Questions
      </h2>
      <div className="mt-12 border-b border-rule">
        {FAQ.map((item) => (
          <details key={item.q} data-faq className="group border-t border-rule">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-2xl [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden="true"
                className="font-mono text-accent-text transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="pb-6 font-serif text-lg text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </Page>
  );
}

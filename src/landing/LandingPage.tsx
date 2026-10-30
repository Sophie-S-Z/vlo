import { Link } from "react-router";

/** Placeholder until M1. The headline stays real HTML text (spec 18.1 item 14). */
export function LandingPage({ appEnabled }: { appEnabled: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="space-y-6">
      <title>Vlo · Write in flow</title>
      <p className="font-mono text-xs tracking-widest text-muted uppercase">Write in flow.</p>
      <h1 id="hero-title" className="font-display text-5xl leading-[1.05] text-balance sm:text-7xl">
        Write the book only you can write.
      </h1>
      <p className="max-w-prose font-serif text-xl text-muted">
        No AI unless you ask for it. Your drafts stay on your device.
      </p>
      {appEnabled && (
        <Link
          to="/app"
          className="inline-block rounded-card border border-accent px-4 py-2 text-accent-text"
        >
          Open the app
        </Link>
      )}
    </section>
  );
}

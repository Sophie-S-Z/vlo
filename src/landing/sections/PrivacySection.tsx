import { PRIVACY } from "../copy";
import { LockArt } from "../art/LockArt";
import { Eyebrow, Page } from "./Page";

export function PrivacySection() {
  return (
    <Page n={5} id="privacy" titleId="privacy-title" className="mx-auto max-w-6xl">
      <Eyebrow n={5}>Privacy</Eyebrow>
      <div className="grid items-center gap-12 md:grid-cols-[1fr_auto]">
        <div>
          <h2
            id="privacy-title"
            className="font-display text-[clamp(2rem,5vw,4rem)] leading-tight text-balance"
          >
            {PRIVACY.title}
          </h2>
          <p className="mt-8 font-mono text-sm text-muted">
            Network log in Pen mode:{" "}
            <span data-zero-requests className="text-fg">
              0 requests
            </span>
          </p>
          <p data-flashlight className="mt-10 max-w-xl font-serif text-2xl">
            {PRIVACY.hidden}
          </p>
        </div>
        <LockArt />
      </div>
    </Page>
  );
}

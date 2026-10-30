import { useEffect, useState } from "react";
import { WAITLIST } from "../copy";
import { PlaneArt } from "../art/PlaneArt";
import { getWaitlistCount } from "../waitlist/api";
import { WaitlistForm } from "../waitlist/WaitlistForm";
import { Eyebrow, Page } from "./Page";

/** Spec 18.4: show the count only when it is real and at least 100. */
export const MIN_SHOWN_COUNT = 100;

export function WaitlistSection({ count: initialCount }: { count?: number | null }) {
  const [count, setCount] = useState<number | null>(initialCount ?? null);

  useEffect(() => {
    if (initialCount !== undefined) return;
    let live = true;
    void getWaitlistCount().then((value) => live && setCount(value));
    return () => {
      live = false;
    };
  }, [initialCount]);

  return (
    <Page n={10} id="waitlist" titleId="waitlist-title" className="mx-auto max-w-3xl">
      <Eyebrow n={10}>Last page</Eyebrow>
      <PlaneArt />
      <h2 id="waitlist-title" className="font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-none">
        {WAITLIST.title}
      </h2>
      {count !== null && count >= MIN_SHOWN_COUNT && (
        <p className="mt-4 font-mono text-sm text-muted">
          {count.toLocaleString("en")} writers are waiting
        </p>
      )}
      <div className="mt-12">
        <WaitlistForm />
      </div>
    </Page>
  );
}

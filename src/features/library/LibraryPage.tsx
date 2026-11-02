import { MARKETING_URL } from '@/app/links';

export function LibraryPage() {
  return (
    <section>
      <h1 className="font-display text-4xl font-semibold">Library</h1>
      <div className="mt-8 rounded-[var(--radius-card)] border border-rule bg-surface p-6">
        <p className="font-manuscript text-xl">Your projects will live here, on this device.</p>
        <p className="mt-3 text-muted">
          Vlo keeps every manuscript in this browser. No Vlo server receives your text.
        </p>
        <p className="mt-4 text-sm">
          <a href={MARKETING_URL} rel="noreferrer">
            Read more about Vlo
          </a>
        </p>
      </div>
    </section>
  );
}

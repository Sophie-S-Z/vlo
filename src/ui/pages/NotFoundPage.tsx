import { Link } from "react-router";

/** Placeholder; the physics version arrives in M1d. */
export default function NotFoundPage() {
  return (
    <section className="space-y-4">
      <h1 className="font-display text-4xl">This page isn't written yet</h1>
      <Link to="/" className="text-accent underline underline-offset-4">
        Go to the first page
      </Link>
    </section>
  );
}

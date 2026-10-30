import { useParams } from "react-router";

/** Placeholder for the beta reader view (M5). */
export default function ShareRoute() {
  const { id } = useParams();
  return (
    <section className="space-y-4">
      <h1 className="font-display text-4xl">Shared draft</h1>
      <p className="font-serif text-lg text-muted">
        Shared drafts open here soon. <span className="font-mono text-sm">{id}</span>
      </p>
    </section>
  );
}

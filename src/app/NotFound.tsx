import { Link } from 'react-router';
import { useDocumentTitle } from './useDocumentTitle';

export function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <section className="max-w-prose">
      <h1 className="font-display text-4xl font-semibold">Page not found</h1>
      <p className="mt-4 text-muted">Vlo has no page at this address.</p>
      <p className="mt-6">
        <Link to="/">Go to the Library</Link>
      </p>
    </section>
  );
}

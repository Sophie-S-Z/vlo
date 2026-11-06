import { Link } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { AI_POLICY } from './aiPolicy';

/* The AI policy page (spec section 10, plan Task D7): four statements, with a version and a date. */

const date = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });

export function AiPolicyPage() {
  useDocumentTitle('AI policy');
  return (
    <article className="mx-auto grid max-w-prose gap-8">
      <header className="grid gap-2">
        <h1 className="font-display text-4xl font-semibold">AI policy</h1>
        <p className="text-muted">
          Version {AI_POLICY.version},{' '}
          <time dateTime={AI_POLICY.date}>{date.format(new Date(AI_POLICY.date))}</time>
        </p>
      </header>
      <ol className="grid gap-6">
        {AI_POLICY.statements.map((statement, index) => (
          <li key={statement.title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 gap-y-1">
            <span aria-hidden="true" className="font-display text-2xl leading-tight text-accent-text">
              {index + 1}
            </span>
            <h2 className="font-display text-xl leading-tight font-semibold">{statement.title}</h2>
            <p className="col-start-2 text-muted">{statement.detail}</p>
          </li>
        ))}
      </ol>
      <p>
        <Link to="/network" className="underline">
          See the network log
        </Link>
      </p>
    </article>
  );
}

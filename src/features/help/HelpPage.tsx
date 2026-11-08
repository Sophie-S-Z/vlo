import { useDocumentTitle } from '@/app/useDocumentTitle';
import { HELP } from './help';

/* The Help page and user guide (plan Task F4): how to use Vlo, and support for painful material. */

const date = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });

export function HelpPage() {
  useDocumentTitle('Help');
  return (
    <article className="mx-auto grid max-w-prose gap-8">
      <header className="grid gap-2">
        <h1 className="font-display text-4xl font-semibold">Help</h1>
        <p className="text-muted">
          Version {HELP.version}, <time dateTime={HELP.date}>{date.format(new Date(HELP.date))}</time>
        </p>
      </header>
      <section
        aria-labelledby="help-care"
        className="grid gap-3 rounded-[var(--radius-card)] border border-rule p-4"
      >
        <h2 id="help-care" className="font-display text-2xl font-semibold">
          When the writing is painful
        </h2>
        {HELP.care.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>If you feel unsafe or need someone to talk to now, these free services can help:</p>
        <ul className="grid gap-2">
          {HELP.support.map((line) => (
            <li key={line.name}>
              <a href={line.url} target="_blank" rel="noreferrer" className="font-medium underline">
                {line.name}
              </a>
              <span className="text-muted"> {line.detail}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Checked on <time dateTime={HELP.checkedOn}>{date.format(new Date(HELP.checkedOn))}</time>. In an
          emergency, call your local emergency number.
        </p>
      </section>
      {HELP.guide.map((section) => (
        <section key={section.title} className="grid gap-2">
          <h2 className="font-display text-2xl font-semibold">{section.title}</h2>
          <ol className="grid list-decimal gap-1 pl-6">
            {section.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}

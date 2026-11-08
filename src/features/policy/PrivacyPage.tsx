import { Link } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import type { NetPurpose } from '@/lib/db';
import { HOSTS } from '@/lib/net';
import { PRIVACY } from './privacy';

/* The privacy page (spec section 12, plan Task F4): what stays on the device, and what can leave and when. */

const date = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });

/** The hosts of a purpose, as the network module allows them. */
function hostsOf(purpose: NetPurpose): string {
  const hosts = HOSTS[purpose];
  return hosts.length === 0 ? 'None in this build, so Vlo sends none of these.' : hosts.join(', ');
}

export function PrivacyPage() {
  useDocumentTitle('Privacy');
  return (
    <article className="mx-auto grid max-w-prose gap-8">
      <header className="grid gap-2">
        <h1 className="font-display text-4xl font-semibold">Privacy</h1>
        <p className="text-muted">
          Version {PRIVACY.version},{' '}
          <time dateTime={PRIVACY.date}>{date.format(new Date(PRIVACY.date))}</time>
        </p>
      </header>
      <section aria-labelledby="privacy-stays" className="grid gap-3">
        <h2 id="privacy-stays" className="font-display text-2xl font-semibold">
          What stays on this device
        </h2>
        <ul className="grid list-disc gap-2 pl-6">
          {PRIVACY.stays.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="privacy-leaves" className="grid gap-4">
        <h2 id="privacy-leaves" className="font-display text-2xl font-semibold">
          What can leave, and when
        </h2>
        {(Object.keys(PRIVACY.leaves) as NetPurpose[]).map((purpose) => {
          const entry = PRIVACY.leaves[purpose];
          return (
            <section key={purpose} className="grid gap-1">
              <h3 className="text-lg font-semibold">{entry.title}</h3>
              <p>{entry.when}</p>
              <p className="text-muted">{entry.sends}</p>
              <p className="text-muted">
                Goes to:{' '}
                <span className="font-mono text-sm [overflow-wrap:anywhere]">{hostsOf(purpose)}</span>
              </p>
            </section>
          );
        })}
      </section>
      <p className="flex flex-wrap gap-x-6 gap-y-2">
        <Link to="/network" className="underline">
          See the network log
        </Link>
        <a href={PRIVACY.contact.url} target="_blank" rel="noreferrer" className="underline">
          {PRIVACY.contact.text}
        </a>
      </p>
    </article>
  );
}

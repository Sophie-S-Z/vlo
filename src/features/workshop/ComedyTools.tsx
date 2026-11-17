import { Dices } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { premise, punchWords } from './comedy';
import type { TextItem } from './WorkshopPage';

/* The comedy tools of the Workshop. The logic is in comedy.ts. */

export function PunchTool({ project, texts }: { project: Project; texts: TextItem[] }) {
  const language = project.settings.language;
  // The bits of the project. A note is not on stage.
  const sections = useMemo(
    () =>
      punchWords(
        texts
          .filter((t) => t.item.kind !== 'note')
          .map((t) => ({ id: t.item.id, title: t.item.title, text: t.text })),
        language,
      ),
    [texts, language],
  );
  if (sections.every((s) => s.punches.length === 0))
    return (
      <p className="max-w-prose text-muted">
        The punch words show when a bit has a joke. Write one, then come back. We will wait. Drum roll.
      </p>
    );
  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-sm text-muted">
        Read only the bold words. If one is not funny alone, move the funny word to the end, or cut what comes
        after it. A blank line ends each joke.
      </p>
      {sections.map((section) => (
        <section key={section.id} aria-label={section.title} className="grid gap-2">
          <h3 className="font-display text-lg font-semibold">
            <Link
              to={`/p/${project.id}?item=${section.id}`}
              className="hover:text-accent-text hover:underline"
            >
              {section.title}
            </Link>
          </h3>
          {section.punches.length === 0 ? (
            <p className="text-sm text-muted">No joke yet. Suspicious.</p>
          ) : (
            <ol className="grid max-w-prose list-decimal gap-1.5 pl-6 font-manuscript text-base">
              {section.punches.map((punch, i) => (
                <li key={i}>
                  <span className="text-muted">{punch.lead} </span>
                  <strong className="text-accent-text">{punch.word}</strong>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

export function PremiseTool() {
  const [idea, setIdea] = useState(() => premise());
  return (
    <div className="grid max-w-prose justify-items-start gap-4">
      <p aria-live="polite" className="font-display text-3xl font-light tracking-[-0.01em] text-balance">
        {idea}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            setIdea((last) => {
              let next = premise();
              // The same idea twice in a row reads as a broken lever.
              while (next === last) next = premise();
              return next;
            });
          }}
        >
          <Dices aria-hidden="true" strokeWidth={1.5} className="size-4" />
          Pull the lever
        </Button>
        <CopyButton label="Copy the premise" text={idea} copied="Premise copied.">
          Copy
        </CopyButton>
      </div>
      <p className="text-sm text-muted">
        Ask what is weird, scary, hard or stupid about it. That is your first joke.
      </p>
    </div>
  );
}

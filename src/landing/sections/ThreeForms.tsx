import { DEMO_MEMOIR, DEMO_POEM, DEMO_SCENES, FORMS } from "../copy";
import { Eyebrow, Page } from "./Page";

export function ThreeForms() {
  return (
    <Page n={4} id="forms" titleId="forms-title" className="overflow-hidden">
      <div className="mx-auto max-w-6xl">
        <Eyebrow n={4}>Three forms</Eyebrow>
        <h2
          id="forms-title"
          className="mb-16 font-display text-[clamp(2rem,5vw,4rem)] leading-tight"
        >
          {FORMS.title}
        </h2>
      </div>
      <div data-forms-track className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
        <Panel title={FORMS.novel} label="Novel">
          <ul data-novel-cards className="relative grid grid-cols-2 gap-2">
            {DEMO_SCENES.map((scene) => (
              <li
                key={scene}
                data-drag-card
                className="rounded-card border border-rule bg-bg p-3 font-mono text-xs"
              >
                {scene}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={FORMS.memoir} label="Memoir">
          <p className="font-serif text-lg leading-relaxed">
            {DEMO_MEMOIR.text.map((part, i) =>
              typeof part === "string" ? (
                <span key={i}>{part}</span>
              ) : (
                <span
                  key={i}
                  data-alias={part.alias}
                  className="underline decoration-accent decoration-dotted underline-offset-4"
                >
                  {part.real}
                </span>
              ),
            )}
          </p>
          <p className="mt-2 font-mono text-xs text-muted">
            Marked names change to their aliases in every share and export.
          </p>
          <ol
            data-timeline
            className="mt-6 flex justify-between border-t border-rule pt-3 font-mono text-[0.65rem] text-muted uppercase"
          >
            {DEMO_MEMOIR.stages.map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ol>
        </Panel>
        <Panel title={FORMS.poetry} label="Poetry">
          <pre
            data-poem
            className="overflow-x-auto font-serif text-base leading-relaxed whitespace-pre"
          >
            {DEMO_POEM.join("\n")}
          </pre>
        </Panel>
      </div>
    </Page>
  );
}

function Panel({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-card border border-rule bg-surface p-6">
      <p className="font-mono text-xs tracking-widest text-accent-text uppercase">{label}</p>
      <h3 className="mt-2 mb-6 font-display text-2xl">{title}</h3>
      {children}
    </article>
  );
}
